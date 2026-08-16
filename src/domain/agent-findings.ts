import { z } from "zod";
import type { Evidence } from "./schemas.js";

const findingSchema = z
  .object({
    requirementId: z.string().trim().min(1).max(80),
    status: z.enum(["satisfied", "missed", "violated", "at_risk", "not_verifiable"]),
    source: z.enum(["transcript", "captions", "visual", "manual"]),
    startMs: z.number().int().min(0).max(86_400_000),
    endMs: z.number().int().min(0).max(86_400_000),
    evidence: z.string().trim().min(1).max(4_000),
    confidence: z.number().min(0).max(1),
    recommendedChange: z.string().trim().min(1).max(2_000).optional()
  })
  .strict()
  .refine((finding) => finding.endMs >= finding.startMs, {
    path: ["endMs"],
    message: "endMs must be greater than or equal to startMs"
  });

export const agentFindingsSchema = z
  .object({
    version: z.literal(1),
    reviewId: z.string().regex(/^bp-review-[A-Z0-9]{4,20}$/),
    findings: z.array(findingSchema).max(2_000),
    limitations: z.array(z.string().trim().min(1).max(2_000)).max(200)
  })
  .strict();

export type AgentFindings = z.infer<typeof agentFindingsSchema>;

export const toEvidence = (findings: AgentFindings["findings"]): Evidence[] =>
  findings.map((finding) => ({
    requirementId: finding.requirementId,
    status: finding.status,
    source: finding.source === "captions" ? "transcript" : finding.source,
    startMs: finding.startMs,
    endMs: finding.endMs,
    excerpt: finding.evidence,
    confidence: finding.confidence
  }));
