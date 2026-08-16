import { describe, expect, it } from "vitest";
import {
  campaignInputSchema,
  evidenceSchema,
  type CampaignInput
} from "../../src/domain/schemas.js";
import { normalizeRequirements } from "../../src/domain/normalize.js";
import { calculateReadiness } from "../../src/domain/scoring.js";

const campaign: CampaignInput = {
  campaignId: "campaign-demo",
  name: "Demo launch",
  requirements: [
    {
      id: "disclosure",
      category: "disclosure",
      description: "Say that the video is sponsored",
      priority: "required",
      verification: "transcript",
      polarity: "required"
    },
    {
      id: "promo",
      category: "promo_code",
      description: "State promo code SAVE20",
      exactText: "SAVE20",
      priority: "high",
      verification: "transcript",
      polarity: "required"
    }
  ]
};

describe("domain contracts", () => {
  it("rejects unknown input fields", () => {
    expect(() => campaignInputSchema.parse({ ...campaign, ignored: true })).toThrow();
  });

  it("rejects duplicate requirement identifiers", () => {
    expect(() =>
      campaignInputSchema.parse({
        ...campaign,
        requirements: [campaign.requirements[0], campaign.requirements[0]]
      })
    ).toThrow("Duplicate requirement ID");
  });

  it("rejects evidence with an inverted timestamp range", () => {
    expect(() =>
      evidenceSchema.parse({
        requirementId: "disclosure",
        source: "transcript",
        status: "satisfied",
        startMs: 2_000,
        endMs: 1_000,
        excerpt: "sponsored",
        confidence: 0.9
      })
    ).toThrow();
  });

  it("normalizes stable IDs and removes semantic duplicates", () => {
    const normalized = normalizeRequirements([
      "Exact phrase: Made with Acme",
      "Exact phrase: Made with Acme",
      "Do not claim this product cures acne"
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      category: "exact_phrase",
      exactText: "Made with Acme",
      polarity: "required"
    });
    expect(normalized[1]).toMatchObject({
      category: "prohibited_claim",
      polarity: "prohibited"
    });
  });

  it("classifies disclosure, visual, caption, CTA, promo, and talking-point lines", () => {
    const normalized = normalizeRequirements([
      "Disclose that this is sponsored",
      "Show the logo on screen",
      "Captions must be accurate",
      "CTA: Visit example.test",
      "Promo code: SAVE20",
      "Mention the lightweight design"
    ]);
    expect(normalized.map((item) => item.category)).toEqual([
      "disclosure",
      "visual_branding",
      "caption",
      "call_to_action",
      "promo_code",
      "talking_point"
    ]);
  });
});

describe("readiness scoring", () => {
  it("is deterministic and scores satisfied requirements", () => {
    const findings = [
      {
        requirementId: "disclosure",
        source: "transcript" as const,
        status: "satisfied" as const,
        startMs: 100,
        endMs: 900,
        excerpt: "This video is sponsored by Acme",
        confidence: 0.98
      },
      {
        requirementId: "promo",
        source: "transcript" as const,
        status: "satisfied" as const,
        startMs: 1_000,
        endMs: 1_500,
        excerpt: "Use SAVE20",
        confidence: 0.95
      }
    ];

    expect(calculateReadiness(campaign, findings)).toEqual(
      calculateReadiness(campaign, findings.toReversed())
    );
    expect(calculateReadiness(campaign, findings)).toMatchObject({
      score: 100,
      verdict: "ready"
    });
  });

  it("caps the score when a required disclosure is missed", () => {
    const report = calculateReadiness(campaign, [
      {
        requirementId: "disclosure",
        source: "transcript",
        status: "missed",
        startMs: 0,
        endMs: 0,
        excerpt: "No disclosure found",
        confidence: 0.95
      },
      {
        requirementId: "promo",
        source: "transcript",
        status: "satisfied",
        startMs: 1_000,
        endMs: 1_500,
        excerpt: "Use SAVE20",
        confidence: 0.95
      }
    ]);

    expect(report.score).toBeLessThanOrEqual(49);
    expect(report.verdict).toBe("blocked");
    expect(report.requirements[0]?.recommendedChange).toContain("sponsored");
  });

  it("does not award credit to unverified requirements", () => {
    const report = calculateReadiness(campaign, []);
    expect(report.score).toBe(0);
    expect(report.verdict).toBe("inconclusive");
    expect(report.requirements.every((item) => item.status === "not_verifiable")).toBe(true);
  });

  it("discards hallucinated requirement IDs and records a limitation", () => {
    const report = calculateReadiness(campaign, [
      {
        requirementId: "made-up",
        source: "visual",
        status: "satisfied",
        startMs: 0,
        endMs: 100,
        excerpt: "Imaginary evidence",
        confidence: 1
      }
    ]);
    expect(report.limitations).toContain("Discarded evidence for unknown requirement: made-up");
    expect(report.score).toBe(0);
  });

  it("discards malformed evidence and gives at-risk evidence partial credit", () => {
    const report = calculateReadiness(campaign, [
      { nonsense: true },
      {
        requirementId: "disclosure",
        source: "transcript",
        status: "at_risk",
        startMs: 0,
        endMs: 100,
        excerpt: "Disclosure may be unclear",
        confidence: 0.5
      },
      {
        requirementId: "promo",
        source: "transcript",
        status: "satisfied",
        startMs: 100,
        endMs: 200,
        excerpt: "SAVE20",
        confidence: 1
      }
    ]);
    expect(report.limitations).toContain("Discarded malformed evidence");
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
    expect(report.verdict).toBe("needs_changes");
  });
});
