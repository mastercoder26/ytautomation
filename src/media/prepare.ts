import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import type { TranscriptSegment } from "../domain/schemas.js";
import { buildAudioExtractionArgs, buildFrameExtractionArgs } from "./commands.js";
import { createMediaContainerRunner, type MediaContainerConfig } from "./container.js";
import { copyImportedFile } from "./file-policy.js";
import { writeArtifactManifest } from "./manifest.js";
import { probeVideo, type VideoMetadata } from "./probe.js";
import { runProcess, safeNativeEnvironment } from "./process.js";
import { transcribeWithWhisperCpp } from "./whisper.js";

export type FrameManifestItem = {
  id: string;
  timestampMs: number;
  relativePath: string;
  sha256: string;
  reason: "uniform";
};

export type PreparedVideo = {
  metadata: VideoMetadata;
  transcript: TranscriptSegment[];
  transcriptStatus: "complete" | "failed";
  frames: FrameManifestItem[];
  artifactDirectory: string;
  limitations: string[];
};

type PrepareDependencies = {
  probe: typeof probeVideo;
  run: typeof runProcess;
  transcribe: typeof transcribeWithWhisperCpp;
};

const MAX_ARTIFACT_BYTES = 500_000_000;
let preparationActive = false;

const isWithin = (candidate: string, root: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
};

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256").update(await readFile(path)).digest("hex");

const prepareVideoOnce = async (options: {
  videoPath: string;
  campaignId: string;
  campaignDigest: string;
  allowedRoots: readonly string[];
  dataRoot: string;
  frameIntervalSeconds?: number | undefined;
  ffmpegCommand?: string | undefined;
  ffprobeCommand?: string | undefined;
  whisperCommand?: string | undefined;
  whisperModelPath?: string | undefined;
  language?: string | undefined;
  mediaContainer?: MediaContainerConfig | undefined;
  dependencies?: Partial<PrepareDependencies> | undefined;
}): Promise<PreparedVideo> => {
  const hasTrustedAdapters = Boolean(options.dependencies?.probe && options.dependencies?.run);
  const dataRoot = resolve(options.dataRoot);
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  const dataRootStats = await lstat(dataRoot);
  if (dataRootStats.isSymbolicLink() || !dataRootStats.isDirectory()) {
    throw new Error("Artifact root must be a real directory, not a symbolic link");
  }
  const canonicalDataRoot = await realpath(dataRoot);
  if (!hasTrustedAdapters && !options.mediaContainer) {
    throw new Error("Native media processing requires a pinned Docker/Podman sandbox image");
  }
  const artifactRoot = await mkdtemp(join(canonicalDataRoot, "job-"));
  await chmod(artifactRoot, 0o700);
  if (!isWithin(artifactRoot, canonicalDataRoot)) throw new Error("Unsafe artifact path");

  try {
    const sandboxedRun = options.mediaContainer
      ? createMediaContainerRunner(options.mediaContainer, artifactRoot)
      : options.dependencies?.run ?? runProcess;
    const probe = options.dependencies?.probe ??
      ((path: string, command?: string) => probeVideo(path, command, sandboxedRun));
    const transcribe = options.dependencies?.transcribe ??
      ((transcriptionOptions: Parameters<typeof transcribeWithWhisperCpp>[0]) =>
        transcribeWithWhisperCpp(transcriptionOptions, sandboxedRun));
    const framesRoot = join(artifactRoot, "frames");
    await mkdir(framesRoot, { mode: 0o700 });
    const stagedInputPath = join(artifactRoot, `input${extname(options.videoPath).toLowerCase()}`);
    const staged = await copyImportedFile(
      options.videoPath,
      options.allowedRoots,
      "video",
      stagedInputPath
    );

    const ffmpeg = options.ffmpegCommand ?? "ffmpeg";
    const metadata = await probe(staged.path, options.ffprobeCommand);
    const interval = options.frameIntervalSeconds ?? Math.max(1, Math.ceil(metadata.durationMs / 120_000));
    const audioPath = join(artifactRoot, "audio.wav");
    await sandboxedRun(ffmpeg, buildAudioExtractionArgs(staged.path, audioPath), {
      timeoutMs: 30 * 60_000,
      maxOutputBytes: 2_000_000,
      env: safeNativeEnvironment(),
      writeBudget: { paths: [audioPath], maxBytes: 100_000_000 }
    });
    await sandboxedRun(
      ffmpeg,
      buildFrameExtractionArgs(staged.path, join(framesRoot, "%04d.jpg"), interval),
      {
        timeoutMs: 30 * 60_000,
        maxOutputBytes: 2_000_000,
        env: safeNativeEnvironment(),
        writeBudget: { paths: [framesRoot], maxBytes: 400_000_000 }
      }
    );

    const frameNames = (await readdir(framesRoot)).filter((name) => name.endsWith(".jpg")).toSorted();
    const framePaths = frameNames.slice(0, 120).map((name) => join(framesRoot, name));
    const outputStats = await Promise.all([stat(audioPath), ...framePaths.map((path) => stat(path))]);
    const outputBytes = outputStats.reduce((sum, item) => sum + item.size, 0);
    if (outputBytes > MAX_ARTIFACT_BYTES) throw new Error("Media artifacts exceed the per-job disk budget");
    await Promise.all([chmod(audioPath, 0o600), ...framePaths.map((path) => chmod(path, 0o600))]);

    const frames = await Promise.all(
      frameNames.slice(0, 120).map(async (name, index): Promise<FrameManifestItem> => ({
        id: `frame-${String(index + 1).padStart(4, "0")}`,
        timestampMs: index * interval * 1_000,
        relativePath: join("frames", name),
        sha256: await sha256(join(framesRoot, name)),
        reason: "uniform"
      }))
    );

    const hasWhisper = Boolean(options.whisperCommand && options.whisperModelPath);
    const transcriptOutputPrefix = join(artifactRoot, "transcript");
    const stagedModelPath = hasWhisper && !options.dependencies?.transcribe
      ? (
          await copyImportedFile(
            options.whisperModelPath ?? "",
            [resolve(options.whisperModelPath ?? "", "..")],
            "model",
            join(artifactRoot, `model${extname(options.whisperModelPath ?? "").toLowerCase()}`)
          )
        ).path
      : options.whisperModelPath;
    const transcript = hasWhisper
      ? await transcribe({
          command: options.whisperCommand ?? "whisper-cli",
          modelPath: stagedModelPath ?? "",
          audioPath,
          outputPrefix: transcriptOutputPrefix,
          ...(options.language ? { language: options.language } : {})
        })
      : [];
    if (hasWhisper) await chmod(`${transcriptOutputPrefix}.json`, 0o600).catch(() => undefined);

    const artifactDirectory = relative(canonicalDataRoot, artifactRoot);
    await writeArtifactManifest(canonicalDataRoot, artifactRoot, {
      artifactId: artifactDirectory,
      campaignId: options.campaignId,
      campaignDigest: options.campaignDigest,
      durationMs: metadata.durationMs,
      transcript,
      transcriptStatus: hasWhisper ? "complete" : "failed",
      visualStatus: frames.length > 0 ? "complete" : "failed",
      frameDigest: createHash("sha256").update(JSON.stringify(frames)).digest("hex")
    });

    await Promise.all([
      rm(staged.path, { force: true }),
      rm(audioPath, { force: true }),
      stagedModelPath && !options.dependencies?.transcribe
        ? rm(stagedModelPath, { force: true })
        : Promise.resolve()
    ]);

    return {
      metadata,
      transcript,
      transcriptStatus: hasWhisper ? "complete" : "failed",
      frames,
      artifactDirectory,
      limitations: hasWhisper ? [] : ["Local whisper.cpp command/model is not configured"]
    };
  } catch (error) {
    await rm(artifactRoot, { recursive: true, force: true });
    throw error;
  }
};

export const prepareVideo = async (
  options: Parameters<typeof prepareVideoOnce>[0]
): Promise<PreparedVideo> => {
  if (preparationActive) throw new Error("Another media preparation job is already running");
  preparationActive = true;
  try {
    return await prepareVideoOnce(options);
  } finally {
    preparationActive = false;
  }
};

export const doctorLocalTools = async (config: {
  ffmpegCommand?: string | undefined;
  ffprobeCommand?: string | undefined;
  whisperCommand?: string | undefined;
  whisperModelPath?: string | undefined;
  mediaContainer?: MediaContainerConfig | undefined;
}, runner: typeof runProcess = runProcess) => {
  const check = async (command: string): Promise<boolean> => {
    try {
      await runner(command, ["-version"], {
        timeoutMs: 3_000,
        maxOutputBytes: 200_000,
        env: safeNativeEnvironment()
      });
      return true;
    } catch {
      return false;
    }
  };
  const [ffmpeg, ffprobe, whisper] = await Promise.all([
    check(config.ffmpegCommand ?? "ffmpeg"),
    check(config.ffprobeCommand ?? "ffprobe"),
    config.whisperCommand ? check(config.whisperCommand) : Promise.resolve(false)
  ]);
  return {
    ffmpeg,
    ffprobe,
    whisperCpp: whisper,
    whisperModelConfigured: Boolean(config.whisperModelPath),
    mediaSandboxConfigured: Boolean(config.mediaContainer),
    networkUsed: false
  };
};
