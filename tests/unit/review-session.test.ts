import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadReviewSession, writeReviewSession } from "../../src/reviews/store.js";

describe("signed review sessions", () => {
  const campaign = {
    campaignId: "acme",
    name: "Acme",
    requirements: [{
      id: "disclosure",
      category: "disclosure" as const,
      description: "Disclose",
      priority: "required" as const,
      verification: "transcript" as const,
      polarity: "required" as const
    }]
  };

  it("loads only a signed session and rejects a forged artifact binding", async () => {
    const root = await mkdtemp(join(tmpdir(), "brandpreflight-session-"));
    const session = await writeReviewSession(root, { campaign, artifactId: "job-review01" });
    await expect(writeReviewSession(root, { campaign, artifactId: "job-review02" })).resolves.toMatchObject({ version: 1 });
    expect((await loadReviewSession(root, session.reviewId)).artifactId).toBe("job-review01");
    const path = join(root, "reviews", session.reviewId, "session.json");
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    await writeFile(path, JSON.stringify({ ...stored, artifactId: "job-forged01" }));
    await expect(loadReviewSession(root, session.reviewId)).rejects.toThrow("signature");
  });
});
