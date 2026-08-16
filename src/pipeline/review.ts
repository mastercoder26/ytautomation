import { calculateReadiness } from "../domain/scoring.js";
import {
  transcriptSegmentSchema,
  type CampaignInput,
  type CampaignReadinessReport,
  type Evidence,
  type TranscriptSegment
} from "../domain/schemas.js";

export type ReviewCampaignInput = {
  campaign: CampaignInput;
  transcript: TranscriptSegment[];
  visualEvidence: Evidence[];
  modelEvidence?: Evidence[];
};

const findExactPhraseEvidence = (
  campaign: CampaignInput,
  transcript: TranscriptSegment[]
): Evidence[] =>
  campaign.requirements
    .filter((requirement) => requirement.exactText && requirement.verification !== "visual")
    .map((requirement) => {
      const match = transcript.find((segment) => segment.text.includes(requirement.exactText ?? ""));
      return match
        ? {
            requirementId: requirement.id,
            source: "transcript" as const,
            status: "satisfied" as const,
            startMs: match.startMs,
            endMs: match.endMs,
            excerpt: match.text,
            confidence: 1
          }
        : {
            requirementId: requirement.id,
            source: "transcript" as const,
            status: "missed" as const,
            startMs: 0,
            endMs: transcript.at(-1)?.endMs ?? 0,
            excerpt: `Exact phrase not found: ${requirement.exactText}`,
            confidence: 1
          };
    });

export const reviewCampaign = (input: ReviewCampaignInput): CampaignReadinessReport => {
  const transcript = input.transcript.map((segment) => transcriptSegmentSchema.parse(segment));
  const exactPhraseEvidence = findExactPhraseEvidence(input.campaign, transcript);
  return calculateReadiness(
    input.campaign,
    [...exactPhraseEvidence, ...input.visualEvidence, ...(input.modelEvidence ?? [])],
    {
      transcriptStatus: transcript.length > 0 ? "complete" : "failed",
      visualStatus: input.visualEvidence.length > 0 ? "complete" : "partial",
      modelAnalysisStatus: input.modelEvidence ? "complete" : "skipped"
    }
  );
};
