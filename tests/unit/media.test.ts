import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyImportedFile, validateImportedFile } from "../../src/media/file-policy.js";
import {
  buildAudioExtractionArgs,
  buildFrameExtractionArgs,
  buildProbeArgs
} from "../../src/media/commands.js";
import { createMediaContainerRunner } from "../../src/media/container.js";
import type { ProcessOptions } from "../../src/media/process.js";

describe("media file policy", () => {
  it("accepts a regular supported file inside an allowed root", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-"));
    const video = join(root, "video.mp4");
    await writeFile(video, "fixture");
    await expect(validateImportedFile(video, [root], "video")).resolves.toMatchObject({
      path: await realpath(video)
    });
  });

  it("rejects traversal, outside-root files, and symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-"));
    const outside = await mkdtemp(join(tmpdir(), "brandpreflight-outside-"));
    const secret = join(outside, "secret.mp4");
    await writeFile(secret, "fixture");
    await mkdir(join(root, "nested"));
    const link = join(root, "nested", "linked.mp4");
    await symlink(secret, link);

    await expect(validateImportedFile(secret, [root], "video")).rejects.toThrow("outside allowed roots");
    await expect(validateImportedFile(link, [root], "video")).rejects.toThrow("symbolic links");
  });

  it("rejects missing roots, NUL bytes, directories, and unsupported extensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-policy-"));
    const text = join(root, "notes.txt");
    await writeFile(text, "fixture");
    await expect(validateImportedFile(text, [], "video")).rejects.toThrow("allowed root");
    await expect(validateImportedFile(`${text}\0`, [root], "video")).rejects.toThrow("NUL");
    await expect(validateImportedFile(root, [root], "video")).rejects.toThrow("regular file");
    await expect(validateImportedFile(text, [root], "video")).rejects.toThrow("Unsupported video");
  });

  it("copies through an opened no-follow handle into an exclusive destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-copy-"));
    const video = join(root, "video.mp4");
    const destination = join(root, "private.mp4");
    await writeFile(video, "safe-content");
    await expect(copyImportedFile(video, [root], "video", destination)).resolves.toMatchObject({
      path: destination,
      size: 12
    });
    await expect(copyImportedFile(video, [root], "video", destination)).rejects.toThrow();
  });
});

describe("native media command construction", () => {
  it("uses fixed argv arrays for probe, audio, and bounded frames", () => {
    expect(buildProbeArgs("/tmp/input;touch pwn.mp4")).toEqual([
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      "/tmp/input;touch pwn.mp4"
    ]);
    expect(buildAudioExtractionArgs("in.mp4", "out.wav").at(-1)).toBe("out.wav");
    expect(buildFrameExtractionArgs("in.mp4", "frames/%04d.jpg", 12)).toContain(
      "fps=1/12,scale=1024:1024:force_original_aspect_ratio=decrease"
    );
    expect(buildAudioExtractionArgs("in.mp4", "out.wav")).toEqual(
      expect.arrayContaining(["-fs", "100000000"])
    );
    expect(buildFrameExtractionArgs("in.mp4", "frames/%04d.jpg", 12)).toEqual(
      expect.arrayContaining(["-fs", "400000000"])
    );
  });

  it("rejects unsafe frame intervals", () => {
    expect(() => buildFrameExtractionArgs("in.mp4", "frames/%04d.jpg", 0)).toThrow("Frame interval");
    expect(() => buildFrameExtractionArgs("in.mp4", "frames/%04d.jpg", 301)).toThrow("Frame interval");
  });

  it("runs native media inside a pinned, resource-limited offline container", async () => {
    const calls: Array<{ command: string; args: readonly string[]; options: ProcessOptions }> = [];
    const jobRoot = "/private/jobs/job-123456";
    const runner = createMediaContainerRunner(
      { runtime: "docker", image: `brandpreflight-media@sha256:${"a".repeat(64)}` },
      jobRoot,
      async (command, args, options) => {
        calls.push({ command, args, options });
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    );
    await runner("ffmpeg", ["-i", `${jobRoot}/input.mp4`, `${jobRoot}/frames/%04d.jpg`], {
      timeoutMs: 1_000,
      maxOutputBytes: 1_024
    });
    expect(calls[0]?.command).toBe("docker");
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        "--network",
        "none",
        "--read-only",
        "--memory",
        "1024m",
        "--cpus",
        "2",
        "--cap-drop",
        "ALL",
        "/usr/bin/timeout",
        "--signal=KILL",
        "1s",
        "ffmpeg",
        "/job/input.mp4",
        "/job/frames/%04d.jpg"
      ])
    );
    expect(calls[0]?.options.terminationCleanup).toMatchObject({
      command: "docker",
      args: ["rm", "--force", expect.stringMatching(/^brandpreflight-media-/)]
    });
    expect(() =>
      createMediaContainerRunner(
        { runtime: "docker", image: "brandpreflight-media:latest" },
        jobRoot
      )
    ).toThrow("pinned by sha256");
    expect(() =>
      createMediaContainerRunner(
        { runtime: "docker", image: `sha256:${"c".repeat(64)}` },
        jobRoot,
        async () => ({ stdout: "", stderr: "", exitCode: 0 })
      )
    ).not.toThrow();
  });
});
