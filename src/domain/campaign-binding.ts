import { createHash } from "node:crypto";
import { campaignInputSchema, type CampaignInput } from "./schemas.js";

export const digestCampaign = (campaign: CampaignInput): string =>
  createHash("sha256").update(JSON.stringify(campaignInputSchema.parse(campaign))).digest("hex");
