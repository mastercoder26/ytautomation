import { agentFindingsSchema, toEvidence, type AgentFindings } from "../domain/agent-findings.js";
import { calculateReadiness } from "../domain/scoring.js";
import { loadArtifactReview } from "../media/manifest.js";
import { writeReport } from "../reports/store.js";
import { digestCampaign } from "../domain/campaign-binding.js";
import { loadReviewSession } from "../reviews/store.js";

export const scoreReview = async (dataRoot: string, input: AgentFindings): Promise<{
  reportId: string;
  score: number;
  verdict: string;
  summary: string;
  reportPath: string;
  openCommand: string;
}> => {
  const findings = agentFindingsSchema.parse(input);
  const session = await loadReviewSession(dataRoot, findings.reviewId);
  const prepared = session.artifactId
    ? await loadArtifactReview(
        dataRoot,
        session.artifactId,
        session.campaign.campaignId,
        digestCampaign(session.campaign)
      )
    : undefined;
  const evidence = toEvidence(findings.findings).map((item) =>
    prepared && item.source === "visual" && !prepared.frameTimestamps.some((timestamp) => timestamp >= item.startMs && timestamp <= item.endMs)
      ? { ...item, status: "not_verifiable" as const }
      : item
  );
  const calculated = calculateReadiness(
    session.campaign,
    evidence,
    prepared?.processing ?? {
      transcriptStatus: "complete",
      visualStatus: "complete",
      modelAnalysisStatus: "complete"
    },
    prepared?.reviewContext
  );
  const recommendedChanges = new Map(
    findings.findings
      .filter((finding) => finding.recommendedChange)
      .map((finding) => [finding.requirementId, finding.recommendedChange] as const)
  );
  const report = {
    ...calculated,
    requirements: calculated.requirements.map((requirement) =>
      (requirement.status === "missed" || requirement.status === "at_risk") && recommendedChanges.has(requirement.id)
        ? { ...requirement, recommendedChange: recommendedChanges.get(requirement.id) }
        : requirement
    )
  };
  const saved = await writeReport(dataRoot, {
    reviewId: session.reviewId,
    report,
    limitations: findings.limitations
  });
  const satisfied = report.requirements.filter((requirement) => requirement.status === "satisfied").length;
  return {
    reportId: saved.reportId,
    score: report.score,
    verdict: report.verdict,
    summary: `${satisfied}/${report.requirements.length} requirements satisfied; verdict: ${report.verdict}.`,
    reportPath: saved.reportPath,
    openCommand: `brandpreflight open ${saved.reportId}`
  };
};
