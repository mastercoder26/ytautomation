import { z } from "zod";
import { processingStatusSchema, requirementSchema } from "./schemas.js";

const savedEvidenceSchema = z
  .object({
    requirementId: z.string().trim().min(1).max(80),
    source: z.enum(["transcript", "visual", "manual"]),
    status: z.enum(["satisfied", "missed", "violated", "at_risk", "not_verifiable"]),
    startMs: z.number().int().min(0).max(86_400_000),
    endMs: z.number().int().min(0).max(86_400_000),
    excerpt: z.string().trim().min(1).max(4_000),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const campaignReadinessReportSchema = z
  .object({
    campaignId: z.string().trim().min(1).max(120),
    score: z.number().int().min(0).max(100),
    verdict: z.enum(["ready", "needs_changes", "blocked", "inconclusive"]),
    requirements: z.array(
      requirementSchema.extend({
        status: z.enum(["satisfied", "missed", "at_risk", "not_verifiable"]),
        evidence: z.array(savedEvidenceSchema),
        recommendedChange: z.string().trim().min(1).max(2_000).optional()
      }).strict()
    ),
    processing: processingStatusSchema,
    limitations: z.array(z.string().trim().min(1).max(2_000))
  })
  .strict();

export type CampaignReadinessReport = z.infer<typeof campaignReadinessReportSchema>;
