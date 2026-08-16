import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import type { TranscriptSegment } from "../domain/schemas.js";
import { buildAudioExtractionArgs, buildFrameExtractionArgs } from "./commands.js";
import { copyImportedFile } from "./file-policy.js";
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
  allowedRoots: readonly string[];
  dataRoot: string;
  frameIntervalSeconds?: number;
  ffmpegCommand?: string;
  ffprobeCommand?: string;
  whisperCommand?: string;
  whisperModelPath?: string;
  language?: string;
  dependencies?: Partial<PrepareDependencies>;
}): Promise<PreparedVideo> => {
  const dependencies: PrepareDependencies = {
    probe: options.dependencies?.probe ?? probeVideo,
    run: options.dependencies?.run ?? runProcess,
    transcribe: options.dependencies?.transcribe ?? transcribeWithWhisperCpp
  };
  const dataRoot = resolve(options.dataRoot);
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  const dataRootStats = await lstat(dataRoot);
  if (dataRootStats.isSymbolicLink() || !dataRootStats.isDirectory()) {
    throw new Error("Artifact root must be a real directory, not a symbolic link");
  }
  const canonicalDataRoot = await realpath(dataRoot);
  const artifactRoot = await mkdtemp(join(canonicalDataRoot, "job-"));
  await chmod(artifactRoot, 0o700);
  if (!isWithin(artifactRoot, canonicalDataRoot)) throw new Error("Unsafe artifact path");

  try {
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
    const metadata = await dependencies.probe(staged.path, options.ffprobeCommand);
    const interval = options.frameIntervalSeconds ?? Math.max(1, Math.ceil(metadata.durationMs / 120_000));
    const audioPath = join(artifactRoot, "audio.wav");
    await dependencies.run(ffmpeg, buildAudioExtractionArgs(staged.path, audioPath), {
      timeoutMs: 30 * 60_000,
      maxOutputBytes: 2_000_000,
      env: safeNativeEnvironment()
    });
    await dependencies.run(
      ffmpeg,
      buildFrameExtractionArgs(staged.path, join(framesRoot, "%04d.jpg"), interval),
      {
        timeoutMs: 30 * 60_000,
        maxOutputBytes: 2_000_000,
        env: safeNativeEnvironment()
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
    const transcript = hasWhisper
      ? await dependencies.transcribe({
          command: options.whisperCommand ?? "whisper-cli",
          modelPath: options.whisperModelPath ?? "",
          audioPath,
          outputPrefix: transcriptOutputPrefix,
          ...(options.language ? { language: options.language } : {})
        })
      : [];
    if (hasWhisper) await chmod(`${transcriptOutputPrefix}.json`, 0o600).catch(() => undefined);

    await Promise.all([rm(staged.path, { force: true }), rm(audioPath, { force: true })]);

    return {
      metadata,
      transcript,
      transcriptStatus: hasWhisper ? "complete" : "failed",
      frames,
      artifactDirectory: relative(canonicalDataRoot, artifactRoot),
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
  ffmpegCommand?: string;
  ffprobeCommand?: string;
  whisperCommand?: string;
  whisperModelPath?: string;
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
    networkUsed: false
  };
};
