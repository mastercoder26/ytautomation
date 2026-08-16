import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText, type PdfTextParser } from "../../src/brief/pdf.js";
import { parseProbeJson } from "../../src/media/probe.js";
import { parseWhisperJson } from "../../src/media/whisper.js";
import { runProcess } from "../../src/media/process.js";

describe("PDF adapter", () => {
  it("extracts bounded text through an isolated parser contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-pdf-"));
    const file = join(root, "brief.pdf");
    await writeFile(file, "%PDF-1.7 fixture");
    const parser: PdfTextParser = async () => ({ text: "Must say Made with Acme", pages: 2 });

    await expect(extractPdfText(file, [root], parser)).resolves.toEqual({
      text: "Must say Made with Acme",
      pages: 2
    });
  });

  it("rejects excessive page counts from the parser", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-pdf-"));
    const file = join(root, "brief.pdf");
    await writeFile(file, "%PDF-1.7 fixture");
    const parser: PdfTextParser = async () => ({ text: "brief", pages: 501 });
    await expect(extractPdfText(file, [root], parser)).rejects.toThrow("page limit");
  });
});

describe("media metadata and local transcription", () => {
  it("validates bounded ffprobe output", () => {
    expect(
      parseProbeJson(
        JSON.stringify({
          format: { duration: "15.25", size: "1024" },
          streams: [{ codec_type: "video", width: 1080, height: 1920, duration: "15.25" }]
        })
      )
    ).toEqual({ durationMs: 15_250, width: 1080, height: 1920, sizeBytes: 1024 });
  });

  it("rejects media that exceeds duration or pixel budgets", () => {
    expect(() =>
      parseProbeJson(
        JSON.stringify({
          format: { duration: "7201" },
          streams: [{ codec_type: "video", width: 3840, height: 2160 }]
        })
      )
    ).toThrow("duration limit");
  });

  it("normalizes whisper.cpp full JSON into ordered transcript segments", () => {
    expect(
      parseWhisperJson({
        transcription: [
          { offsets: { from: 0, to: 950 }, text: " Sponsored by Acme. " },
          { offsets: { from: 950, to: 1800 }, text: "Use SAVE20." }
        ]
      })
    ).toEqual([
      { startMs: 0, endMs: 950, text: "Sponsored by Acme." },
      { startMs: 950, endMs: 1800, text: "Use SAVE20." }
    ]);
  });
});

describe("bounded process execution", () => {
  it("captures stdout without using a shell", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "process.stdout.write('ok')"], {
        timeoutMs: 2_000,
        maxOutputBytes: 1_024
      })
    ).resolves.toMatchObject({ stdout: "ok", exitCode: 0 });
  });

  it("terminates a process that exceeds its deadline", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        timeoutMs: 20,
        maxOutputBytes: 1_024
      })
    ).rejects.toThrow("timed out");
  });
});
