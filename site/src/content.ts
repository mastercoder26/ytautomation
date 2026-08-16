export const AGENTS = ['Codex', 'Claude Code', 'Cursor', 'Other agent'] as const;

export type AgentName = (typeof AGENTS)[number];

const agentOpeners: Record<AgentName, string> = {
  Codex: 'Use Codex to',
  'Claude Code': 'Use Claude Code to',
  Cursor: 'Use Cursor to',
  'Other agent': 'Use your coding agent to'
};

export function buildSetupPrompt(agent: AgentName, skillUrl: string): string {
  return `${agentOpeners[agent]} install BrandPreflight from https://github.com/mastercoder26/ytautomation, then read the hosted setup skill at ${skillUrl}, finish the private setup steps, and tell me when you are ready to review a sponsored video.`;
}

export function buildPromptPresentation(agent: AgentName, skillUrl: string) {
  return {
    label: `Paste this into ${agent}`,
    prompt: buildSetupPrompt(agent, skillUrl)
  };
}

export const workflowSteps = [
  {
    number: '01',
    title: 'Attach the brief + video',
    description:
      'The creator gives their agent a campaign PDF and the finished sponsored video.'
  },
  {
    number: '02',
    title: 'Ask for BrandPreflight',
    description:
      'The skill extracts requirements, checks media evidence, and requests strict findings.'
  },
  {
    number: '03',
    title: 'Open the signed report',
    description:
      'Get a deterministic score, concrete edits, and a browser report with timestamps.'
  }
] as const;

export const featureCards = [
  {
    number: '01',
    title: 'Brief extraction',
    description:
      'Exact phrases, disclosures, claims, promo codes, calls to action, captions, and visual requirements.'
  },
  {
    number: '02',
    title: 'Evidence-bound scoring',
    description:
      'Strict JSON, requirement IDs, timestamped observations, and deterministic 0–100 readiness scoring.'
  },
  {
    number: '03',
    title: 'Human results screen',
    description:
      'A clean local report with requirements, timestamps, limitations, and the next edit to make.'
  },
  {
    number: '04',
    title: 'Works where agents work',
    description:
      'Two portable GitHub skills, one copyable setup prompt, and no host-specific plugin configuration.'
  }
] as const;
