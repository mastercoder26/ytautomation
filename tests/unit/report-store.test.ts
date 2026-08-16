import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadReport, writeReport } from "../../src/reports/store.js";

describe("signed local reports", () => {
  it("writes a unique signed report and refuses a tampered payload", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "brandpreflight-report-"));
    const saved = await writeReport(dataRoot, {
      reviewId: "bp-review-8F3K",
      report: {
        campaignId: "acme",
        score: 92,
        verdict: "ready",
        requirements: [],
        processing: {
          transcriptStatus: "complete",
          visualStatus: "complete",
          modelAnalysisStatus: "complete"
        },
        limitations: []
      },
      limitations: []
    });

    expect(saved.reportId).toMatch(/^bp-[A-Z0-9]{6,20}$/);
    await expect(writeReport(dataRoot, {
      reviewId: "bp-review-8F3L",
      report: {
        campaignId: "acme-two",
        score: 0,
        verdict: "inconclusive",
        requirements: [],
        processing: {
          transcriptStatus: "failed",
          visualStatus: "failed",
          modelAnalysisStatus: "skipped"
        },
        limitations: []
      },
      limitations: []
    })).resolves.toMatchObject({ reportId: expect.stringMatching(/^bp-/) });
    expect((await loadReport(dataRoot, saved.reportId)).report.score).toBe(92);

    const stored = JSON.parse(await readFile(saved.reportPath, "utf8")) as Record<string, unknown>;
    await writeFile(saved.reportPath, JSON.stringify({ ...stored, report: { ...(stored.report as object), score: 100 } }));
    await expect(loadReport(dataRoot, saved.reportId)).rejects.toThrow("signature");
  });
});
