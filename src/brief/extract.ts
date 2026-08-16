import { normalizeRequirements } from "../domain/normalize.js";
import type { CampaignRequirement } from "../domain/schemas.js";

const MAX_BRIEF_BYTES = 500_000;

export const extractRequirementCandidates = (briefText: string): CampaignRequirement[] => {
  if (!briefText.trim()) throw new Error("Brief text is empty");
  if (Buffer.byteLength(briefText, "utf8") > MAX_BRIEF_BYTES) {
    throw new Error(`Brief text exceeds ${MAX_BRIEF_BYTES} bytes`);
  }

  const candidateLines = briefText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));

  if (candidateLines.length === 0) {
    return normalizeRequirements(
      briefText
        .split(/[\n;]/)
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }
  return normalizeRequirements(candidateLines);
};
