import { z } from "zod";
import { buildProbeArgs } from "./commands.js";
import { runProcess } from "./process.js";

const probeSchema = z
  .object({
    format: z
      .object({
        duration: z.string().optional(),
        size: z.string().optional()
      })
      .passthrough(),
    streams: z.array(
      z
        .object({
          codec_type: z.string().optional(),
          width: z.number().int().positive().optional(),
          height: z.number().int().positive().optional(),
          duration: z.string().optional()
        })
        .passthrough()
    )
  })
  .passthrough();

export type VideoMetadata = {
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
};

export const parseProbeJson = (raw: string): VideoMetadata => {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("ffprobe returned invalid JSON");
  }
  const probe = probeSchema.parse(json);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height) throw new Error("Video stream metadata is missing");
  const durationSeconds = Number(probe.format.duration ?? video.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Video duration is invalid");
  if (durationSeconds > 7_200) throw new Error("Video duration limit exceeded");
  if (video.width * video.height > 20_000_000) throw new Error("Video pixel limit exceeded");
  const sizeBytes = Number(probe.format.size ?? 0);
  return {
    durationMs: Math.round(durationSeconds * 1_000),
    width: video.width,
    height: video.height,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0
  };
};

export const probeVideo = async (inputPath: string, ffprobeCommand = "ffprobe"): Promise<VideoMetadata> => {
  const result = await runProcess(ffprobeCommand, buildProbeArgs(inputPath), {
    timeoutMs: 15_000,
    maxOutputBytes: 2_000_000
  });
  return parseProbeJson(result.stdout);
};
