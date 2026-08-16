# BrandPreflight

BrandPreflight is the scoring and report layer for sponsored-video reviews. Your agent uses the portable [`/watch`](https://github.com/bradautomates/claude-video) skill to understand the video, then BrandPreflight validates the evidence, calculates the score, and saves a signed report.

## Start from the website

Open [brandpreflight.vercel.app](https://brandpreflight.vercel.app), copy the setup prompt, and paste it into your agent. It tells the agent to install these two GitHub skills:

```bash
npx skills add mastercoder26/ytautomation -g
npx skills add bradautomates/claude-video -g
```

The first skill is BrandPreflight; the second is the maintained video-watching skill. There is no Codex plugin, marketplace entry, MCP registration, Docker image, or separate local video model to configure.

Install the report CLI when the agent asks, or do it yourself:

```bash
npm install -g brandpreflight
```

`/watch` manages its own first-use media prerequisites such as FFmpeg, captions, and optional transcription. Follow its prompts when it asks for permission to install a system dependency.

## Review a sponsored video

Attach a campaign PDF and finished video, then say:

> Use BrandPreflight to review this sponsored video against the attached campaign brief.

The skill runs `/watch` for the video and uses this small CLI handoff internally:

```bash
brandpreflight review --brief campaign.pdf --video sponsored-video.mp4
# The agent writes its required findings JSON to findings.json.
brandpreflight score --review bp-review-8F3K --input findings.json
brandpreflight open bp-7XQ4M2
```

The agent supplies observations only. BrandPreflight rejects invalid findings, calculates the deterministic 0–100 score itself, and saves a signed report. You never need to create campaign JSON, artifact IDs, approval-token files, or review-context JSON.

## What it checks

- Campaign requirements extracted from the brief
- Transcript, captions, frames, branding, disclosures, claims, and calls to action observed by `/watch`
- Versioned evidence with requirement IDs, timestamps, sources, and confidence
- Required-item failures and practical recommended edits
- A browser report with the final score, verdict, and limitations

Raw media stays with the agent and `/watch` unless you explicitly choose otherwise. BrandPreflight stores only the local review session and signed report needed for scoring.

## Development

```bash
npm install
npm run check
npm run package:check
```

MIT License.
