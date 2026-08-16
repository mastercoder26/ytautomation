import { describe, expect, it } from "vitest";
import { reviewCampaign } from "../../src/pipeline/review.js";

describe("offline campaign review", () => {
  it("combines transcript and visual evidence into timestamped recommendations", () => {
    const report = reviewCampaign({
      campaign: {
        campaignId: "campaign-e2e",
        name: "Acme launch",
        requirements: [
          {
            id: "phrase",
            category: "exact_phrase",
            description: "Say Made with Acme",
            exactText: "Made with Acme",
            priority: "required",
            verification: "transcript",
            polarity: "required"
          },
          {
            id: "logo",
            category: "visual_branding",
            description: "Show the Acme logo",
            priority: "high",
            verification: "visual",
            polarity: "required"
          }
        ]
      },
      transcript: [
        { startMs: 1_000, endMs: 2_000, text: "This is Made with Acme." }
      ],
      visualEvidence: [
        {
          requirementId: "logo",
          source: "visual",
          status: "missed",
          startMs: 0,
          endMs: 5_000,
          excerpt: "Logo is not visible",
          confidence: 0.9
        }
      ]
    });

    expect(report.requirements.find((item) => item.id === "phrase")).toMatchObject({
      status: "satisfied"
    });
    expect(report.requirements.find((item) => item.id === "logo")?.recommendedChange).toContain(
      "Acme logo"
    );
    expect(report.verdict).toBe("needs_changes");
  });

  it("marks a missing exact phrase and an empty transcript as needing changes", () => {
    const report = reviewCampaign({
      campaign: {
        campaignId: "missing-phrase",
        name: "Missing phrase",
        requirements: [
          {
            id: "phrase",
            category: "exact_phrase",
            description: "Say the exact phrase",
            exactText: "required phrase",
            priority: "high",
            verification: "transcript",
            polarity: "required"
          }
        ]
      },
      transcript: [],
      visualEvidence: [],
      modelEvidence: []
    });
    expect(report).toMatchObject({ verdict: "needs_changes", processing: { transcriptStatus: "failed" } });
    expect(report.requirements[0]?.status).toBe("missed");
  });
});
