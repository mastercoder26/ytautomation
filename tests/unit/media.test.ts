import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateImportedFile } from "../../src/media/file-policy.js";
import {
  buildAudioExtractionArgs,
  buildFrameExtractionArgs,
  buildProbeArgs
} from "../../src/media/commands.js";

describe("media file policy", () => {
  it("accepts a regular supported file inside an allowed root", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-"));
    const video = join(root, "video.mp4");
    await writeFile(video, "fixture");
    await expect(validateImportedFile(video, [root], "video")).resolves.toMatchObject({ path: video });
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
    expect(buildFrameExtractionArgs("in.mp4", "frames/%04d.jpg", 12)).toContain("fps=1/12");
  });

  it("rejects unsafe frame intervals", () => {
    expect(() => buildFrameExtractionArgs("in.mp4", "frames/%04d.jpg", 0)).toThrow("Frame interval");
    expect(() => buildFrameExtractionArgs("in.mp4", "frames/%04d.jpg", 301)).toThrow("Frame interval");
  });
});
