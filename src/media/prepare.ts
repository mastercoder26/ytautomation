import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { TranscriptSegment } from "../domain/schemas.js";
import { buildAudioExtractionArgs, buildFrameExtractionArgs } from "./commands.js";
import { validateImportedFile } from "./file-policy.js";
import { probeVideo, type VideoMetadata } from "./probe.js";
import { runProcess } from "./process.js";
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
  now: () => number;
  probe: typeof probeVideo;
  run: typeof runProcess;
  transcribe: typeof transcribeWithWhisperCpp;
};

const isWithin = (candidate: string, root: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
};

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256").update(await readFile(path)).digest("hex");

export const prepareVideo = async (options: {
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
    now: options.dependencies?.now ?? Date.now,
    probe: options.dependencies?.probe ?? probeVideo,
    run: options.dependencies?.run ?? runProcess,
    transcribe: options.dependencies?.transcribe ?? transcribeWithWhisperCpp
  };
  const file = await validateImportedFile(options.videoPath, options.allowedRoots, "video");
  const dataRoot = resolve(options.dataRoot);
  const safeName = basename(file.path).replace(/[^a-z0-9._-]/gi, "-");
  const artifactRoot = resolve(dataRoot, `${safeName}-${dependencies.now()}`);
  if (!isWithin(artifactRoot, dataRoot)) throw new Error("Unsafe artifact path");
  const framesRoot = join(artifactRoot, "frames");
  await mkdir(framesRoot, { recursive: true, mode: 0o700 });

  const ffmpeg = options.ffmpegCommand ?? "ffmpeg";
  const metadata = await dependencies.probe(file.path, options.ffprobeCommand);
  const interval = options.frameIntervalSeconds ?? Math.max(1, Math.ceil(metadata.durationMs / 120_000));
  const audioPath = join(artifactRoot, "audio.wav");
  await dependencies.run(ffmpeg, buildAudioExtractionArgs(file.path, audioPath), {
    timeoutMs: 30 * 60_000,
    maxOutputBytes: 2_000_000
  });
  await dependencies.run(ffmpeg, buildFrameExtractionArgs(file.path, join(framesRoot, "%04d.jpg"), interval), {
    timeoutMs: 30 * 60_000,
    maxOutputBytes: 2_000_000
  });

  const frameNames = (await readdir(framesRoot)).filter((name) => name.endsWith(".jpg")).toSorted();
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
  const transcript = hasWhisper
    ? await dependencies.transcribe({
        command: options.whisperCommand ?? "whisper-cli",
        modelPath: options.whisperModelPath ?? "",
        audioPath,
        outputPrefix: join(artifactRoot, "transcript"),
        ...(options.language ? { language: options.language } : {})
      })
    : [];

  return {
    metadata,
    transcript,
    transcriptStatus: hasWhisper ? "complete" : "failed",
    frames,
    artifactDirectory: relative(dataRoot, artifactRoot),
    limitations: hasWhisper ? [] : ["Local whisper.cpp command/model is not configured"]
  };
};

export const doctorLocalTools = async (config: {
  ffmpegCommand?: string;
  ffprobeCommand?: string;
  whisperCommand?: string;
  whisperModelPath?: string;
}, runner: typeof runProcess = runProcess) => {
  const check = async (command: string): Promise<boolean> => {
    try {
      await runner(command, ["-version"], { timeoutMs: 3_000, maxOutputBytes: 200_000 });
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
