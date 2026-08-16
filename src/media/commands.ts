export const buildProbeArgs = (inputPath: string): string[] => [
  "-v",
  "error",
  "-show_format",
  "-show_streams",
  "-of",
  "json",
  inputPath
];

export const buildAudioExtractionArgs = (inputPath: string, outputPath: string): string[] => [
  "-nostdin",
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  inputPath,
  "-vn",
  "-ac",
  "1",
  "-ar",
  "16000",
  "-c:a",
  "pcm_s16le",
  outputPath
];

export const buildFrameExtractionArgs = (
  inputPath: string,
  outputPattern: string,
  intervalSeconds: number
): string[] => {
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 300) {
    throw new Error("Frame interval must be an integer from 1 to 300 seconds");
  }
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vf",
    `fps=1/${intervalSeconds}`,
    "-frames:v",
    "120",
    outputPattern
  ];
};
