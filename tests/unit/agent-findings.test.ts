import { describe, expect, it } from "vitest";
import { agentFindingsSchema, toEvidence } from "../../src/domain/agent-findings.js";

describe("BrandPreflight agent findings contract", () => {
  const finding = {
    requirementId: "disclosure",
    status: "satisfied",
    source: "transcript",
    startMs: 1_000,
    endMs: 2_500,
    evidence: "This video is sponsored by Acme.",
    confidence: 0.98
  };

  it("accepts the versioned findings envelope and converts model evidence without a score", () => {
    const parsed = agentFindingsSchema.parse({
      version: 1,
      reviewId: "bp-review-8F3K",
      findings: [finding],
      limitations: []
    });

    expect(toEvidence(parsed.findings)).toEqual([
      {
        requirementId: "disclosure",
        status: "satisfied",
        source: "transcript",
        startMs: 1_000,
        endMs: 2_500,
        excerpt: "This video is sponsored by Acme.",
        confidence: 0.98
      }
    ]);
  });

  it("rejects score fields, unsupported sources, inverted ranges, and unknown fields", () => {
    expect(() =>
      agentFindingsSchema.parse({
        version: 1,
        reviewId: "bp-review-8F3K",
        findings: [{ ...finding, score: 100 }],
        limitations: []
      })
    ).toThrow();
    expect(() =>
      agentFindingsSchema.parse({
        version: 1,
        reviewId: "bp-review-8F3K",
        findings: [{ ...finding, source: "audio" }],
        limitations: []
      })
    ).toThrow();
    expect(() =>
      agentFindingsSchema.parse({
        version: 1,
        reviewId: "bp-review-8F3K",
        findings: [{ ...finding, startMs: 2_501 }],
        limitations: [],
        extra: true
      })
    ).toThrow();
  });
});
