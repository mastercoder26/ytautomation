import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli.js";

describe("BrandPreflight CLI", () => {
  it("locates the bundled review skill after npm installation", async () => {
    const output: string[] = [];
    const exitCode = await runCli(["skill"], {
      stdout: (value) => output.push(value),
      stderr: () => undefined
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(output.join(""))).toMatchObject({
      name: "brandpreflight-review",
      path: expect.stringContaining("skills/brandpreflight-review/SKILL.md")
    });
  });

  it("scores a structured assessment from a local JSON file", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-cli-"));
    const input = join(root, "assessment.json");
    await writeFile(
      input,
      JSON.stringify({
        campaign: {
          campaignId: "cli-campaign",
          name: "CLI campaign",
          requirements: [
            {
              id: "promo",
              category: "promo_code",
              description: "Say SAVE20",
              exactText: "SAVE20",
              priority: "required",
              verification: "transcript",
              polarity: "required"
            }
          ]
        },
        evidence: [
          {
            requirementId: "promo",
            source: "transcript",
            status: "satisfied",
            startMs: 1_000,
            endMs: 1_500,
            excerpt: "SAVE20",
            confidence: 1
          }
        ],
        reviewContext: {
          durationMs: 2_000,
          transcript: [{ startMs: 1_000, endMs: 1_500, text: "SAVE20" }]
        },
        processing: {
          transcriptStatus: "complete",
          visualStatus: "failed",
          modelAnalysisStatus: "complete"
        }
      })
    );
    const output: string[] = [];
    const exitCode = await runCli(["score", "--input", input, "--root", root], {
      stdout: (value) => output.push(value),
      stderr: () => undefined
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(output.join(""))).toMatchObject({ score: 100, verdict: "ready" });
  });

  it("returns a non-zero code and a safe message for an unknown command", async () => {
    const errors: string[] = [];
    const exitCode = await runCli(["launch-missiles"], {
      stdout: () => undefined,
      stderr: (value) => errors.push(value)
    });
    expect(exitCode).toBe(2);
    expect(errors.join(" ")).toContain("Unknown command");
  });

  it("issues approvals only into an explicitly selected private data directory", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "brandpreflight-cli-approval-"));
    const assetRoot = await mkdtemp(join(tmpdir(), "brandpreflight-cli-campaign-"));
    const campaignPath = join(assetRoot, "campaign.json");
    await writeFile(
      campaignPath,
      JSON.stringify({
        campaignId: "cli-campaign",
        name: "CLI campaign",
        requirements: [
          {
            id: "promo",
            category: "promo_code",
            description: "Say SAVE20",
            priority: "required",
            verification: "transcript",
            polarity: "required"
          }
        ]
      })
    );
    const output: string[] = [];
    const approved = await runCli(
      ["approve", "--campaign", campaignPath, "--root", assetRoot, "--data-dir", dataRoot],
      { stdout: (value) => output.push(value), stderr: () => undefined }
    );
    expect(approved).toBe(0);
    expect(JSON.parse(output.join(""))).toMatchObject({ approvalToken: expect.stringMatching(/^[a-f0-9]{64}$/) });

    const errors: string[] = [];
    const missingDirectory = await runCli(["approve", "--campaign", campaignPath, "--root", assetRoot], {
      stdout: () => undefined,
      stderr: (value) => errors.push(value)
    });
    expect(missingDirectory).toBe(1);
    expect(errors.join(" ")).toContain("--data-dir");
  });
});
