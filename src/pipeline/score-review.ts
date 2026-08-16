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
  reportPath: string;
  openCommand: string;
}> => {
  const findings = agentFindingsSchema.parse(input);
  const session = await loadReviewSession(dataRoot, findings.reviewId);
  const { processing, reviewContext } = await loadArtifactReview(
    dataRoot,
    session.artifactId,
    session.campaign.campaignId,
    digestCampaign(session.campaign)
  );
  const report = calculateReadiness(session.campaign, toEvidence(findings.findings), processing, reviewContext);
  const saved = await writeReport(dataRoot, {
    reviewId: session.reviewId,
    report,
    limitations: findings.limitations
  });
  return {
    reportId: saved.reportId,
    score: report.score,
    verdict: report.verdict,
    reportPath: saved.reportPath,
    openCommand: `brandpreflight open ${saved.reportId}`
  };
};
