import { createHash } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeShareApproval, issueShareApproval } from "../../src/consent/approval.js";
import { createMediaContainerRunner } from "../../src/media/container.js";
import { loadArtifactReview, writeArtifactManifest } from "../../src/media/manifest.js";
import { runProcess } from "../../src/media/process.js";
import { summarizePreparedVideoForMcp } from "../../src/mcp/server.js";

describe("out-of-band sharing approvals", () => {
  it("binds a one-time token to its campaign and expiry", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-approval-"));
    const digest = "0".repeat(64);
    const wrongCampaign = await issueShareApproval(root, "campaign-a", digest);
    await expect(
      consumeShareApproval(root, "campaign-b", digest, wrongCampaign.approvalToken)
    ).resolves.toBe(false);
    const wrongDigest = await issueShareApproval(root, "campaign-a", digest);
    await expect(
      consumeShareApproval(root, "campaign-a", "1".repeat(64), wrongDigest.approvalToken)
    ).resolves.toBe(false);

    const expired = await issueShareApproval(root, "campaign-a", digest, -1);
    await expect(consumeShareApproval(root, "campaign-a", digest, expired.approvalToken)).resolves.toBe(false);
    await expect(consumeShareApproval(root, "campaign-a", digest, "not-a-token")).resolves.toBe(false);
  });

  it("refuses a symlink approval root", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-approval-link-"));
    const target = await mkdtemp(join(tmpdir(), "brandpreflight-approval-target-"));
    await symlink(target, join(root, "approvals"));
    await expect(issueShareApproval(root, "campaign-a", "0".repeat(64))).rejects.toThrow("real directory");
  });
});

describe("signed artifact manifests", () => {
  it("loads a genuine manifest and rejects invalid identifiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-manifest-"));
    const artifactId = "job-manifest1";
    const artifactRoot = join(root, artifactId);
    await mkdir(artifactRoot, { mode: 0o700 });
    await writeArtifactManifest(root, artifactRoot, {
      artifactId,
      campaignId: "campaign-manifest",
      campaignDigest: "0".repeat(64),
      durationMs: 1_000,
      transcript: [{ startMs: 0, endMs: 500, text: "hello" }],
      transcriptStatus: "complete",
      visualStatus: "failed",
      frameDigest: createHash("sha256").update("frames").digest("hex")
    });
    await expect(
      loadArtifactReview(root, artifactId, "campaign-manifest", "0".repeat(64))
    ).resolves.toMatchObject({
      reviewContext: { durationMs: 1_000 },
      processing: { transcriptStatus: "complete", visualStatus: "failed" }
    });
    await expect(
      loadArtifactReview(root, "../escape", "campaign-manifest", "0".repeat(64))
    ).rejects.toThrow("Invalid artifact identifier");
  });

  it("refuses a symlink artifact root", async () => {
    const parent = await mkdtemp(join(tmpdir(), "brandpreflight-manifest-link-"));
    const target = await mkdtemp(join(tmpdir(), "brandpreflight-manifest-target-"));
    await symlink(target, join(parent, "job-manifest1"));
    await expect(
      loadArtifactReview(parent, "job-manifest1", "campaign-manifest", "0".repeat(64))
    ).rejects.toThrow("real directory");
  });

  it("rejects an invalid persisted signing key", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-manifest-key-"));
    const artifactId = "job-manifest2";
    const artifactRoot = join(root, artifactId);
    await mkdir(artifactRoot);
    await writeFile(join(root, ".manifest-key"), "short");
    await expect(
      writeArtifactManifest(root, artifactRoot, {
        artifactId,
        campaignId: "campaign-manifest",
        campaignDigest: "0".repeat(64),
        durationMs: 100,
        transcript: [],
        transcriptStatus: "failed",
        visualStatus: "failed",
        frameDigest: "0".repeat(64)
      })
    ).rejects.toThrow("signing key");
  });
});

describe("native process containment", () => {
  it("does not expose transcript or frame paths before MCP approval", () => {
    const summary = summarizePreparedVideoForMcp(
      {
        metadata: { durationMs: 1_000, width: 1080, height: 1920, sizeBytes: 123 },
        transcript: [{ startMs: 0, endMs: 500, text: "private creator speech" }],
        transcriptStatus: "complete",
        frames: [
          {
            id: "frame-0001",
            timestampMs: 0,
            relativePath: "frames/0001.jpg",
            sha256: "0".repeat(64),
            reason: "uniform"
          }
        ],
        artifactDirectory: "job-summary1",
        limitations: []
      },
      "campaign-summary"
    );
    expect(summary).toMatchObject({
      artifactId: "job-summary1",
      campaignId: "campaign-summary",
      frameCount: 1,
      transcriptStatus: "complete"
    });
    expect(summary).not.toHaveProperty("transcript");
    expect(summary).not.toHaveProperty("frames");
    expect(JSON.stringify(summary)).not.toContain("private creator speech");
    expect(JSON.stringify(summary)).not.toContain("frames/0001.jpg");
  });

  it("rejects command paths inside the media container contract", async () => {
    const runner = createMediaContainerRunner(
      { runtime: "podman", image: `media@sha256:${"b".repeat(64)}` },
      "/private/job-123456",
      async () => ({ stdout: "", stderr: "", exitCode: 0 })
    );
    await expect(
      runner("/bin/ffmpeg", [], { timeoutMs: 1_000, maxOutputBytes: 1_024 })
    ).rejects.toThrow("command name");
  });

  it("kills a process that exceeds its filesystem write budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-write-budget-"));
    const output = join(root, "oversized.bin");
    await expect(
      runProcess(
        process.execPath,
        [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], Buffer.alloc(4096)); setInterval(() => {}, 1000)",
          output
        ],
        {
          timeoutMs: 2_000,
          maxOutputBytes: 1_024,
          writeBudget: { paths: [join(root, "missing"), root], maxBytes: 100 }
        }
      )
    ).rejects.toThrow("write budget");
    await writeFile(join(root, "marker"), "contained");
  });
});
