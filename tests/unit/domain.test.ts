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
    const processing = {
      transcriptStatus: "complete" as const,
      visualStatus: "failed" as const,
      modelAnalysisStatus: "complete" as const
    };
    const reviewContext = {
      durationMs: 1_500,
      transcript: [
        { startMs: 100, endMs: 900, text: "This video is sponsored by Acme" },
        { startMs: 1_000, endMs: 1_500, text: "Use SAVE20" }
      ]
    };

    expect(calculateReadiness(campaign, findings, processing, reviewContext)).toEqual(
      calculateReadiness(campaign, findings.toReversed(), processing, reviewContext)
    );
    expect(calculateReadiness(campaign, findings, processing, reviewContext)).toMatchObject({
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

  it("rejects the wrong evidence source for a requirement", () => {
    const visualCampaign: CampaignInput = {
      campaignId: "visual-campaign",
      name: "Visual campaign",
      requirements: [
        {
          id: "logo",
          category: "visual_branding",
          description: "Show the logo",
          priority: "required",
          verification: "visual",
          polarity: "required"
        }
      ]
    };
    const report = calculateReadiness(visualCampaign, [
      {
        requirementId: "logo",
        source: "transcript",
        status: "satisfied",
        startMs: 0,
        endMs: 1_000,
        excerpt: "The logo is visible",
        confidence: 1
      }
    ]);
    expect(report).toMatchObject({ score: 0, verdict: "inconclusive" });
    expect(report.limitations).toContain("Discarded transcript evidence incompatible with visual requirement: logo");
  });

  it("rejects evidence outside the reviewed duration or absent from the cited transcript", () => {
    const report = calculateReadiness(
      campaign,
      [
        {
          requirementId: "promo",
          source: "transcript",
          status: "satisfied",
          startMs: 9_000,
          endMs: 10_000,
          excerpt: "SAVE20",
          confidence: 1
        },
        {
          requirementId: "disclosure",
          source: "transcript",
          status: "satisfied",
          startMs: 0,
          endMs: 500,
          excerpt: "This video is sponsored",
          confidence: 1
        }
      ],
      {
        transcriptStatus: "complete",
        visualStatus: "failed",
        modelAnalysisStatus: "complete"
      },
      {
        durationMs: 2_000,
        transcript: [{ startMs: 0, endMs: 500, text: "Nothing relevant here" }]
      }
    );
    expect(report.score).toBe(0);
    expect(report.limitations).toEqual(
      expect.arrayContaining([
        "Discarded evidence outside reviewed duration: promo",
        "Discarded transcript evidence not found in cited segment: disclosure"
      ])
    );
  });

  it.each(["partial", "failed"] as const)(
    "does not report ready when required transcript processing is %s",
    (transcriptStatus) => {
      const report = calculateReadiness(
        campaign,
        [
          {
            requirementId: "disclosure",
            source: "transcript",
            status: "satisfied",
            startMs: 0,
            endMs: 500,
            excerpt: "This video is sponsored by Acme",
            confidence: 1
          },
          {
            requirementId: "promo",
            source: "transcript",
            status: "satisfied",
            startMs: 500,
            endMs: 1_000,
            excerpt: "Use SAVE20",
            confidence: 1
          }
        ],
        {
          transcriptStatus,
          visualStatus: "failed",
          modelAnalysisStatus: "complete"
        },
        {
          durationMs: 1_000,
          transcript: [
            { startMs: 0, endMs: 500, text: "This video is sponsored by Acme" },
            { startMs: 500, endMs: 1_000, text: "Use SAVE20" }
          ]
        }
      );

      expect(report.score).toBeLessThan(85);
      expect(report.verdict).toBe("inconclusive");
      expect(report.limitations).toContain(`Transcript processing is ${transcriptStatus}`);
    }
  );

  it.each([
    { verification: "visual" as const, source: "visual" as const },
    { verification: "manual" as const, source: "manual" as const }
  ])("requires complete $verification processing before ready", ({ verification, source }) => {
    const streamCampaign: CampaignInput = {
      campaignId: `${verification}-processing`,
      name: `${verification} processing`,
      requirements: [
        {
          id: "stream-check",
          category: "custom",
          description: "Complete the required stream check",
          priority: "required",
          verification,
          polarity: "required"
        }
      ]
    };
    const report = calculateReadiness(
      streamCampaign,
      [
        {
          requirementId: "stream-check",
          source,
          status: "satisfied",
          startMs: 0,
          endMs: 100,
          excerpt: "Observed evidence",
          confidence: 1
        }
      ],
      { transcriptStatus: "complete", visualStatus: "partial", modelAnalysisStatus: "skipped" },
      { durationMs: 100, transcript: [] }
    );
    expect(report).toMatchObject({ score: 84, verdict: "inconclusive" });
  });
});
