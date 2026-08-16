import { z } from "zod";

export const requirementCategorySchema = z.enum([
  "talking_point",
  "exact_phrase",
  "disclosure",
  "promo_code",
  "call_to_action",
  "prohibited_claim",
  "visual_branding",
  "caption",
  "editing",
  "custom"
]);

export const requirementSchema = z
  .object({
    id: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i),
    category: requirementCategorySchema,
    description: z.string().trim().min(1).max(2_000),
    exactText: z.string().trim().min(1).max(1_000).optional(),
    priority: z.enum(["required", "high", "normal"]),
    verification: z.enum(["transcript", "visual", "both", "manual"]),
    polarity: z.enum(["required", "prohibited"])
  })
  .strict();

export const campaignInputSchema = z
  .object({
    campaignId: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(200),
    requirements: z.array(requirementSchema).min(1).max(250)
  })
  .strict()
  .superRefine((campaign, context) => {
    const ids = new Set<string>();
    for (const requirement of campaign.requirements) {
      if (ids.has(requirement.id)) {
        context.addIssue({
          code: "custom",
          path: ["requirements"],
          message: `Duplicate requirement ID: ${requirement.id}`
        });
      }
      ids.add(requirement.id);
    }
  });

export const evidenceSchema = z
  .object({
    requirementId: z.string().trim().min(1).max(80),
    source: z.enum(["transcript", "visual", "manual"]),
    status: z.enum(["satisfied", "missed", "violated", "at_risk", "not_verifiable"]),
    startMs: z.number().int().min(0).max(86_400_000),
    endMs: z.number().int().min(0).max(86_400_000),
    excerpt: z.string().trim().min(1).max(4_000),
    confidence: z.number().min(0).max(1)
  })
  .strict()
  .refine((evidence) => evidence.endMs >= evidence.startMs, {
    path: ["endMs"],
    message: "endMs must be greater than or equal to startMs"
  });

export const transcriptSegmentSchema = z
  .object({
    startMs: z.number().int().min(0).max(86_400_000),
    endMs: z.number().int().min(0).max(86_400_000),
    text: z.string().trim().min(1).max(20_000)
  })
  .strict()
  .refine((segment) => segment.endMs >= segment.startMs, {
    path: ["endMs"],
    message: "endMs must be greater than or equal to startMs"
  });

export const processingStatusSchema = z
  .object({
    transcriptStatus: z.enum(["complete", "partial", "failed"]),
    visualStatus: z.enum(["complete", "partial", "failed"]),
    modelAnalysisStatus: z.enum(["complete", "skipped", "failed"])
  })
  .strict();

export const reviewContextSchema = z
  .object({
    durationMs: z.number().int().positive().max(7_200_000),
    transcript: z.array(transcriptSegmentSchema).max(20_000)
  })
  .strict();

export type RequirementCategory = z.infer<typeof requirementCategorySchema>;
export type CampaignRequirement = z.infer<typeof requirementSchema>;
export type CampaignInput = z.infer<typeof campaignInputSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;
export type ReviewContext = z.infer<typeof reviewContextSchema>;

export type RequirementResult = CampaignRequirement & {
  status: "satisfied" | "missed" | "at_risk" | "not_verifiable";
  evidence: Evidence[];
  recommendedChange?: string;
};

export type CampaignReadinessReport = {
  campaignId: string;
  score: number;
  verdict: "ready" | "needs_changes" | "blocked" | "inconclusive";
  requirements: RequirementResult[];
  processing: ProcessingStatus;
  limitations: string[];
};
