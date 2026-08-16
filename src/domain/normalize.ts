import { createHash } from "node:crypto";
import type { CampaignRequirement, RequirementCategory } from "./schemas.js";

const stripBullet = (value: string): string => value.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();

const classify = (line: string): RequirementCategory => {
  const lower = line.toLowerCase();
  if (/^(?:exact phrase|must say|required phrase)\s*:/i.test(line) || /must say\s+["“]/i.test(line)) {
    return "exact_phrase";
  }
  if (/\b(?:promo|coupon|discount)\s+code\b/i.test(line)) return "promo_code";
  if (/^(?:cta|call to action)\s*:/i.test(line)) return "call_to_action";
  if (/\b(?:sponsor(?:ed|ship)?|paid partnership|#ad|disclos)/i.test(lower)) return "disclosure";
  if (/^(?:do not|don't|never|prohibited|avoid)\b/i.test(line)) return "prohibited_claim";
  if (/\b(?:logo|on[- ]screen|show|display|visual|product shot)\b/i.test(lower)) return "visual_branding";
  if (/\bcaption/i.test(lower)) return "caption";
  return "talking_point";
};

const extractExactText = (line: string, category: RequirementCategory): string | undefined => {
  const quoted = line.match(/["“]([^"”]+)["”]/)?.[1]?.trim();
  if (quoted) return quoted;
  if (category === "exact_phrase") return line.replace(/^(?:exact phrase|must say|required phrase)\s*:\s*/i, "").trim();
  if (category === "promo_code") {
    return line.match(/(?:promo|coupon|discount)\s+code\s*[:=]?\s*([A-Z0-9_-]{2,40})/i)?.[1];
  }
  if (category === "call_to_action") return line.replace(/^(?:cta|call to action)\s*:\s*/i, "").trim();
  return undefined;
};

const requirementId = (category: RequirementCategory, line: string): string => {
  const digest = createHash("sha256").update(`${category}\0${line.toLowerCase()}`).digest("hex").slice(0, 10);
  return `${category.replace(/_/g, "-")}-${digest}`;
};

export const normalizeRequirements = (lines: readonly string[]): CampaignRequirement[] => {
  const seen = new Set<string>();
  const normalized: CampaignRequirement[] = [];

  for (const rawLine of lines) {
    const line = stripBullet(rawLine);
    if (!line) continue;
    const category = classify(line);
    const exactText = extractExactText(line, category);
    const key = `${category}\0${(exactText ?? line).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const candidate: CampaignRequirement = {
      id: requirementId(category, exactText ?? line),
      category,
      description: line,
      priority: category === "disclosure" || category === "prohibited_claim" ? "required" : "high",
      verification:
        category === "visual_branding" || category === "caption" ? "visual" : "transcript",
      polarity: category === "prohibited_claim" ? "prohibited" : "required",
      ...(exactText ? { exactText } : {})
    };
    normalized.push(candidate);
  }

  return normalized;
};
