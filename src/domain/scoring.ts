import {
  campaignInputSchema,
  evidenceSchema,
  type CampaignInput,
  type CampaignReadinessReport,
  type Evidence,
  type ProcessingStatus,
  type ReviewContext,
  type RequirementResult
} from "./schemas.js";

const WEIGHTS = { required: 5, high: 3, normal: 1 } as const;
const CREDIT = { satisfied: 1, at_risk: 0.25, missed: 0, not_verifiable: 0 } as const;

const statusFromEvidence = (
  evidence: readonly Evidence[],
  verification: CampaignInput["requirements"][number]["verification"]
): RequirementResult["status"] => {
  if (evidence.some((item) => item.status === "missed" || item.status === "violated")) return "missed";
  if (evidence.some((item) => item.status === "at_risk")) return "at_risk";
  if (verification === "both") {
    const satisfiedSources = new Set(
      evidence.filter((item) => item.status === "satisfied").map((item) => item.source)
    );
    if (satisfiedSources.has("transcript") && satisfiedSources.has("visual")) return "satisfied";
    if (satisfiedSources.size > 0) return "at_risk";
  }
  if (evidence.some((item) => item.status === "satisfied")) return "satisfied";
  return "not_verifiable";
};

const sourceMatches = (
  verification: CampaignInput["requirements"][number]["verification"],
  source: Evidence["source"]
): boolean =>
  verification === "both"
    ? source === "transcript" || source === "visual"
    : verification === source;

const excerptMatchesTranscript = (evidence: Evidence, context: ReviewContext): boolean => {
  if (evidence.source !== "transcript" || evidence.status !== "satisfied") return true;
  const excerpt = evidence.excerpt.toLocaleLowerCase();
  return context.transcript.some(
    (segment) =>
      segment.startMs <= evidence.endMs &&
      segment.endMs >= evidence.startMs &&
      segment.text.toLocaleLowerCase().includes(excerpt)
  );
};

const defaultProcessing: ProcessingStatus = {
  transcriptStatus: "partial",
  visualStatus: "partial",
  modelAnalysisStatus: "skipped"
};

export const calculateReadiness = (
  input: CampaignInput,
  proposedEvidence: readonly unknown[],
  processing: ProcessingStatus = defaultProcessing,
  reviewContext?: ReviewContext
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
    const requirement = campaign.requirements.find((item) => item.id === parsed.data.requirementId);
    if (!requirement || !sourceMatches(requirement.verification, parsed.data.source)) {
      limitations.push(
        `Discarded ${parsed.data.source} evidence incompatible with ${requirement?.verification ?? "unknown"} requirement: ${parsed.data.requirementId}`
      );
      continue;
    }
    if (reviewContext && parsed.data.endMs > reviewContext.durationMs) {
      limitations.push(`Discarded evidence outside reviewed duration: ${parsed.data.requirementId}`);
      continue;
    }
    if (reviewContext && !excerptMatchesTranscript(parsed.data, reviewContext)) {
      limitations.push(`Discarded transcript evidence not found in cited segment: ${parsed.data.requirementId}`);
      continue;
    }
    evidence.push(parsed.data);
  }

  const needsTranscript = campaign.requirements.some(
    (item) => item.verification === "transcript" || item.verification === "both"
  );
  const needsVisual = campaign.requirements.some(
    (item) => item.verification === "visual" || item.verification === "both"
  );
  const needsManual = campaign.requirements.some((item) => item.verification === "manual");
  if (needsTranscript && processing.transcriptStatus !== "complete") {
    limitations.push(`Transcript processing is ${processing.transcriptStatus}`);
  }
  if (needsVisual && processing.visualStatus !== "complete") {
    limitations.push(`Visual processing is ${processing.visualStatus}`);
  }
  if (needsManual && processing.modelAnalysisStatus !== "complete") {
    limitations.push(`Model analysis is ${processing.modelAnalysisStatus}`);
  }
  const requiredProcessingIncomplete =
    (needsTranscript && processing.transcriptStatus !== "complete") ||
    (needsVisual && processing.visualStatus !== "complete") ||
    (needsManual && processing.modelAnalysisStatus !== "complete");

  const requirements: RequirementResult[] = campaign.requirements.map((requirement) => {
    const matched = evidence
      .filter((item) => item.requirementId === requirement.id)
      .toSorted((left, right) => left.startMs - right.startMs || left.excerpt.localeCompare(right.excerpt));
    const status = statusFromEvidence(matched, requirement.verification);
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
  if (requiredProcessingIncomplete) score = Math.min(score, 84);

  const allUnverified = requirements.every((item) => item.status === "not_verifiable");
  const hasChanges = requirements.some((item) => item.status === "missed" || item.status === "at_risk");
  const verdict = blockingMiss
    ? "blocked"
    : allUnverified
      ? "inconclusive"
      : hasChanges
        ? "needs_changes"
        : requiredProcessingIncomplete
          ? "inconclusive"
          : score < 85
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
