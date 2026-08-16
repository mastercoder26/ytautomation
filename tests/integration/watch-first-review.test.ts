import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreReview } from "../../src/pipeline/score-review.js";
import { loadReport } from "../../src/reports/store.js";
import { writeReviewSession } from "../../src/reviews/store.js";

describe("watch-first reviews", () => {
  it("scores a brief-bound review without Docker artifacts when the agent used /watch", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-watch-first-"));
    const campaign = {
      campaignId: "watch-first",
      name: "Watch first",
      requirements: [{
        id: "disclosure",
        category: "disclosure" as const,
        description: "Disclose sponsorship",
        priority: "required" as const,
        verification: "transcript" as const,
        polarity: "required" as const
      }]
    };
    const session = await writeReviewSession(root, { campaign });
    const scored = await scoreReview(root, {
      version: 1,
      reviewId: session.reviewId,
      findings: [{
        requirementId: "disclosure",
        source: "transcript",
        status: "satisfied",
        startMs: 1_000,
        endMs: 2_000,
        evidence: "This video is sponsored by Acme.",
        confidence: 0.98
      }],
      limitations: []
    });
    expect(scored).toMatchObject({ score: 100, verdict: "ready" });
    expect((await loadReport(root, scored.reportId)).report.campaignId).toBe("watch-first");
  });
});
