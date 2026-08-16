import { access, mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText, type PdfTextParser } from "../../src/brief/pdf.js";
import { parseProbeJson } from "../../src/media/probe.js";
import { parseWhisperJson } from "../../src/media/whisper.js";
import { runProcess } from "../../src/media/process.js";
import { doctorLocalTools, prepareVideo } from "../../src/media/prepare.js";
import { deleteArtifactDirectory } from "../../src/media/artifacts.js";
import { transcribeWithWhisperCpp } from "../../src/media/whisper.js";

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

  it("rejects non-PDF magic bytes and empty extracted text", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-pdf-"));
    const invalid = join(root, "invalid.pdf");
    await writeFile(invalid, "not a pdf");
    await expect(extractPdfText(invalid, [root], async () => ({ text: "x", pages: 1 }))).rejects.toThrow(
      "valid PDF"
    );
    const empty = join(root, "empty.pdf");
    await writeFile(empty, "%PDF-1.7 fixture");
    await expect(extractPdfText(empty, [root], async () => ({ text: " ", pages: 1 }))).rejects.toThrow(
      "no extractable text"
    );
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

  it("rejects invalid probe output and missing video metadata", () => {
    expect(() => parseProbeJson("not-json")).toThrow("invalid JSON");
    expect(() => parseProbeJson(JSON.stringify({ format: {}, streams: [] }))).toThrow("Video stream");
    expect(() =>
      parseProbeJson(
        JSON.stringify({
          format: { duration: "invalid" },
          streams: [{ codec_type: "video", width: 10, height: 10 }]
        })
      )
    ).toThrow("duration is invalid");
    expect(() =>
      parseProbeJson(
        JSON.stringify({
          format: { duration: "1" },
          streams: [{ codec_type: "video", width: 10_000, height: 10_000 }]
        })
      )
    ).toThrow("pixel limit");
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

  it("rejects overlapping whisper.cpp segments", () => {
    expect(() =>
      parseWhisperJson({
        transcription: [
          { offsets: { from: 0, to: 1_000 }, text: "one" },
          { offsets: { from: 900, to: 1_200 }, text: "two" }
        ]
      })
    ).toThrow("overlap");
  });

  it("invokes whisper.cpp with a fixed argument list and reads its JSON artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-whisper-"));
    const outputPrefix = join(root, "transcript");
    const calls: string[][] = [];
    const transcript = await transcribeWithWhisperCpp(
      {
        command: "whisper-cli",
        modelPath: join(root, "model.bin"),
        audioPath: join(root, "audio.wav"),
        outputPrefix,
        language: "en"
      },
      async (_command, args) => {
        calls.push([...args]);
        await writeFile(
          `${outputPrefix}.json`,
          JSON.stringify({
            transcription: [{ offsets: { from: 0, to: 500 }, text: "hello" }]
          })
        );
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    );
    expect(calls[0]).toEqual(
      expect.arrayContaining(["-m", join(root, "model.bin"), "-f", join(root, "audio.wav"), "-ojf"])
    );
    expect(transcript).toEqual([{ startMs: 0, endMs: 500, text: "hello" }]);
  });

  it("rejects oversized whisper JSON before reading it into host memory", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-whisper-limit-"));
    const outputPrefix = join(root, "transcript");
    await expect(
      transcribeWithWhisperCpp(
        {
          command: "whisper-cli",
          modelPath: join(root, "model.bin"),
          audioPath: join(root, "audio.wav"),
          outputPrefix
        },
        async () => {
          await writeFile(`${outputPrefix}.json`, Buffer.alloc(10_000_001, 32));
          return { stdout: "", stderr: "", exitCode: 0 };
        }
      )
    ).rejects.toThrow("size limit");
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

  it("can pass bounded stdin to an isolated worker process", async () => {
    await expect(
      runProcess(
        process.execPath,
        ["-e", "process.stdin.on('data', chunk => process.stdout.write(chunk))"],
        { timeoutMs: 2_000, maxOutputBytes: 1_024, stdin: "local-only" }
      )
    ).resolves.toMatchObject({ stdout: "local-only", exitCode: 0 });
  });

  it("terminates a process that exceeds its deadline", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-process-cleanup-"));
    const marker = join(root, "cleanup-ran");
    await expect(
      runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        timeoutMs: 20,
        maxOutputBytes: 1_024,
        terminationCleanup: {
          command: process.execPath,
          args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'yes')", marker]
        }
      })
    ).rejects.toThrow("timed out");
    await expect(access(marker)).resolves.toBeUndefined();
  });

  it("rejects non-zero exits and bounded-output violations", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "process.exit(7)"], {
        timeoutMs: 2_000,
        maxOutputBytes: 1_024
      })
    ).rejects.toThrow("code 7");
    await expect(
      runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(2048))"], {
        timeoutMs: 2_000,
        maxOutputBytes: 100
      })
    ).rejects.toThrow("output exceeded");
  });
});

describe("video preparation orchestration", () => {
  it("creates bounded local artifacts with injected offline adapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-prepare-"));
    const videoPath = join(root, "creator.mp4");
    const dataRoot = join(root, "artifacts");
    await writeFile(videoPath, "fixture");
    const run = async (_command: string, args: readonly string[]) => {
      const target = args.at(-1) ?? "";
      if (target.endsWith("audio.wav")) await writeFile(target, "audio");
      if (target.endsWith("%04d.jpg")) {
        await mkdir(target.replace("/%04d.jpg", ""), { recursive: true });
        await writeFile(target.replace("%04d", "0001"), "frame-one");
        await writeFile(target.replace("%04d", "0002"), "frame-two");
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const result = await prepareVideo({
      videoPath,
      campaignId: "campaign-prepare",
      campaignDigest: "0".repeat(64),
      allowedRoots: [root],
      dataRoot,
      frameIntervalSeconds: 5,
      whisperCommand: "whisper-cli",
      whisperModelPath: join(root, "model.bin"),
      dependencies: {
        probe: async () => ({ durationMs: 10_000, width: 1080, height: 1920, sizeBytes: 7 }),
        run,
        transcribe: async () => [{ startMs: 0, endMs: 500, text: "Sponsored by Acme" }]
      }
    });

    expect(result).toMatchObject({
      transcriptStatus: "complete",
      frames: [
        { id: "frame-0001", timestampMs: 0, reason: "uniform" },
        { id: "frame-0002", timestampMs: 5_000, reason: "uniform" }
      ]
    });
    expect(result.artifactDirectory).toMatch(/^job-/);
    expect(result.frames.every((frame) => frame.sha256.length === 64)).toBe(true);
    await expect(
      deleteArtifactDirectory(dataRoot, result.artifactDirectory, true)
    ).resolves.toEqual({ deleted: result.artifactDirectory });
    expect(await readdir(dataRoot)).toEqual([".manifest-key"]);
    await expect(deleteArtifactDirectory(dataRoot, "../outside", true)).rejects.toThrow(
      "Invalid artifact identifier"
    );
    await expect(deleteArtifactDirectory(dataRoot, "job-ABC123", false)).rejects.toThrow(
      "explicit confirmation"
    );
  });

  it("reports local tool readiness without network access", async () => {
    const result = await doctorLocalTools(
      {
        ffmpegCommand: "ffmpeg-ok",
        ffprobeCommand: "ffprobe-bad",
        whisperCommand: "whisper-ok",
        whisperModelPath: "/models/whisper.bin"
      },
      async (command) => {
        if (command.includes("bad")) throw new Error("missing");
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    );
    expect(result).toEqual({
      ffmpeg: true,
      ffprobe: false,
      whisperCpp: true,
      whisperModelConfigured: true,
      mediaSandboxConfigured: false,
      networkUsed: false
    });
  });

  it("reports whether an explicitly configured host watch skill is installed", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-watch-"));
    await mkdir(join(root, "scripts"));
    await writeFile(join(root, "scripts", "watch.py"), "# fixture");
    await expect(doctorLocalTools({ watchSkillPath: root }, async () => ({ stdout: "", stderr: "", exitCode: 0 })))
      .resolves.toMatchObject({ watch: { installed: true, path: root } });
    await expect(doctorLocalTools({ watchSkillPath: join(root, "missing") }, async () => ({ stdout: "", stderr: "", exitCode: 0 })))
      .resolves.toMatchObject({ watch: { installed: false } });
  });

  it("prepares frames without claiming a transcript when whisper is not configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-prepare-local-"));
    const videoPath = join(root, "creator.mp4");
    await writeFile(videoPath, "fixture");
    const result = await prepareVideo({
      videoPath,
      campaignId: "campaign-local",
      campaignDigest: "0".repeat(64),
      allowedRoots: [root],
      dataRoot: join(root, "artifacts"),
      dependencies: {
        probe: async () => ({ durationMs: 1_000, width: 100, height: 100, sizeBytes: 7 }),
        run: async (_command, args) => {
          const target = args.at(-1) ?? "";
          if (target.endsWith("audio.wav")) await writeFile(target, "audio");
          return { stdout: "", stderr: "", exitCode: 0 };
        }
      }
    });
    expect(result).toMatchObject({
      transcript: [],
      transcriptStatus: "failed",
      limitations: ["Local whisper.cpp command/model is not configured"]
    });
  });

  it("rejects a symlink artifact root and removes failed private jobs", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-cleanup-"));
    const videoPath = join(root, "creator.mp4");
    const realArtifacts = join(root, "real-artifacts");
    const linkedArtifacts = join(root, "linked-artifacts");
    await writeFile(videoPath, "fixture");
    await mkdir(realArtifacts);
    await symlink(realArtifacts, linkedArtifacts);
    await expect(
      prepareVideo({
        videoPath,
        campaignId: "campaign-symlink",
        campaignDigest: "0".repeat(64),
        allowedRoots: [root],
        dataRoot: linkedArtifacts
      })
    ).rejects.toThrow("symbolic link");

    await expect(
      prepareVideo({
        videoPath,
        campaignId: "campaign-failure",
        campaignDigest: "0".repeat(64),
        allowedRoots: [root],
        dataRoot: realArtifacts,
        dependencies: {
          probe: async () => ({ durationMs: 1_000, width: 100, height: 100, sizeBytes: 7 }),
          run: async () => {
            throw new Error("ffmpeg failed");
          }
        }
      })
    ).rejects.toThrow("ffmpeg failed");
    expect(await readdir(realArtifacts)).toEqual([]);
  });
});
