import { readFile } from "node:fs/promises";
import { z } from "zod";
import { transcriptSegmentSchema, type TranscriptSegment } from "../domain/schemas.js";
import { runProcess } from "./process.js";

const whisperOutputSchema = z
  .object({
    transcription: z.array(
      z
        .object({
          offsets: z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }),
          text: z.string()
        })
        .passthrough()
    )
  })
  .passthrough();

export const parseWhisperJson = (value: unknown): TranscriptSegment[] => {
  const output = whisperOutputSchema.parse(value);
  const segments = output.transcription.map((item) =>
    transcriptSegmentSchema.parse({
      startMs: item.offsets.from,
      endMs: item.offsets.to,
      text: item.text.trim()
    })
  );
  for (let index = 1; index < segments.length; index += 1) {
    if ((segments[index]?.startMs ?? 0) < (segments[index - 1]?.endMs ?? 0)) {
      throw new Error("Whisper transcript segments overlap or are out of order");
    }
  }
  return segments;
};

export const transcribeWithWhisperCpp = async (options: {
  command: string;
  modelPath: string;
  audioPath: string;
  outputPrefix: string;
  language?: string;
}, runner: typeof runProcess = runProcess): Promise<TranscriptSegment[]> => {
  const args = [
    "-m",
    options.modelPath,
    "-f",
    options.audioPath,
    "-ojf",
    "-of",
    options.outputPrefix,
    "-np",
    ...(options.language ? ["-l", options.language] : [])
  ];
  await runner(options.command, args, { timeoutMs: 30 * 60_000, maxOutputBytes: 5_000_000 });
  const raw = await readFile(`${options.outputPrefix}.json`, "utf8");
  return parseWhisperJson(JSON.parse(raw));
};
