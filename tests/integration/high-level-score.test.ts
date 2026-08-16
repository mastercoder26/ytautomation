import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { digestCampaign } from "../../src/domain/campaign-binding.js";
import { writeArtifactManifest } from "../../src/media/manifest.js";
import { scoreReview } from "../../src/pipeline/score-review.js";
import { serveReport } from "../../src/reports/server.js";
import { loadReport } from "../../src/reports/store.js";
import { writeReviewSession } from "../../src/reviews/store.js";

describe("high-level review scoring", () => {
  it("scores only findings bound to a signed review and serves its saved report", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "brandpreflight-high-level-"));
    const campaign = {
      campaignId: "acme",
      name: "Acme",
      requirements: [{
        id: "disclosure",
        category: "disclosure" as const,
        description: "Disclose sponsorship",
        priority: "required" as const,
        verification: "transcript" as const,
        polarity: "required" as const
      }]
    };
    const artifactId = "job-review01";
    const artifactRoot = join(dataRoot, artifactId);
    await mkdir(artifactRoot, { mode: 0o700 });
    await writeArtifactManifest(dataRoot, artifactRoot, {
      artifactId,
      campaignId: campaign.campaignId,
      campaignDigest: digestCampaign(campaign),
      durationMs: 3_000,
      transcript: [{ startMs: 1_000, endMs: 2_000, text: "This video is sponsored by Acme." }],
      transcriptStatus: "complete",
      visualStatus: "complete",
      frameDigest: "0".repeat(64)
    });
    const session = await writeReviewSession(dataRoot, { campaign, artifactId });
    const result = await scoreReview(dataRoot, {
      version: 1,
      reviewId: session.reviewId,
      findings: [{
        requirementId: "disclosure",
        status: "satisfied",
        source: "transcript",
        startMs: 1_000,
        endMs: 2_000,
        evidence: "This video is sponsored by Acme.",
        confidence: 0.98
      }],
      limitations: []
    });

    expect(result).toMatchObject({ score: 100, verdict: "ready", summary: "1/1 requirements satisfied; verdict: ready.", openCommand: `brandpreflight open ${result.reportId}` });
    expect((await loadReport(dataRoot, result.reportId)).reviewId).toBe(session.reviewId);

    const reportServer = await serveReport({ dataRoot, reportId: result.reportId });
    try {
      const response = await fetch(`${reportServer.url}report.json`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ reportId: result.reportId, report: { score: 100 } });
      expect((await fetch(reportServer.url)).headers.get("content-security-policy")).toContain("default-src 'self'");
      expect((await fetch(`${reportServer.url}styles.css`)).headers.get("content-type")).toContain("text/css");
      expect((await fetch(`${reportServer.url}app.js`)).headers.get("content-type")).toContain("text/javascript");
      expect((await fetch(`${reportServer.url}../../session.json`)).status).toBe(404);
    } finally {
      await reportServer.close();
    }
  });
});
