import {
  campaignInputSchema,
  evidenceSchema,
  type CampaignInput,
  type CampaignReadinessReport,
  type Evidence,
  type ProcessingStatus,
  type RequirementResult
} from "./schemas.js";

const WEIGHTS = { required: 5, high: 3, normal: 1 } as const;
const CREDIT = { satisfied: 1, at_risk: 0.25, missed: 0, not_verifiable: 0 } as const;

const statusFromEvidence = (evidence: readonly Evidence[]): RequirementResult["status"] => {
  if (evidence.some((item) => item.status === "missed" || item.status === "violated")) return "missed";
  if (evidence.some((item) => item.status === "at_risk")) return "at_risk";
  if (evidence.some((item) => item.status === "satisfied")) return "satisfied";
  return "not_verifiable";
};

const defaultProcessing: ProcessingStatus = {
  transcriptStatus: "partial",
  visualStatus: "partial",
  modelAnalysisStatus: "skipped"
};

export const calculateReadiness = (
  input: CampaignInput,
  proposedEvidence: readonly unknown[],
  processing: ProcessingStatus = defaultProcessing
): CampaignReadinessReport => {
  const campaign = campaignInputSchema.parse(input);
  const knownIds = new Set(campaign.requirements.map((requirement) => requirement.id));
  const limitations: string[] = [];
  const evidence: Evidence[] = [];

  for (const proposed of proposedEvidence) {
    const parsed = evidenceSchema.safeParse(proposed);
    if (!parsed.success) {
      limitations.push("Discarded malformed evidence");
      continue;
    }
    if (!knownIds.has(parsed.data.requirementId)) {
      limitations.push(`Discarded evidence for unknown requirement: ${parsed.data.requirementId}`);
      continue;
    }
    evidence.push(parsed.data);
  }

  const requirements: RequirementResult[] = campaign.requirements.map((requirement) => {
    const matched = evidence
      .filter((item) => item.requirementId === requirement.id)
      .toSorted((left, right) => left.startMs - right.startMs || left.excerpt.localeCompare(right.excerpt));
    const status = statusFromEvidence(matched);
    return {
      ...requirement,
      status,
      evidence: matched,
      ...(status === "missed" || status === "at_risk"
        ? { recommendedChange: `Add or correct: ${requirement.description}.` }
        : {})
    };
  });

  const denominator = requirements.reduce((sum, item) => sum + WEIGHTS[item.priority], 0);
  const earned = requirements.reduce(
    (sum, item) => sum + WEIGHTS[item.priority] * CREDIT[item.status],
    0
  );
  let score = denominator === 0 ? 0 : Math.round((earned / denominator) * 100);

  const blockingMiss = requirements.some(
    (item) =>
      item.status === "missed" &&
      (item.category === "disclosure" || item.category === "prohibited_claim") &&
      item.priority === "required"
  );
  if (blockingMiss) score = Math.min(score, 49);

  const allUnverified = requirements.every((item) => item.status === "not_verifiable");
  const hasChanges = requirements.some((item) => item.status === "missed" || item.status === "at_risk");
  const verdict = blockingMiss
    ? "blocked"
    : allUnverified
      ? "inconclusive"
      : hasChanges || score < 85
        ? "needs_changes"
        : "ready";

  return {
    campaignId: campaign.campaignId,
    score,
    verdict,
    requirements,
    processing,
    limitations: [...new Set(limitations)].toSorted()
  };
};
