# BrandPreflight

BrandPreflight is the scoring and report layer for sponsored-video reviews. It validates agent-collected evidence, calculates the score, and saves a signed report.

## Start from the website

Open [brandpreflight.vercel.app](https://brandpreflight.vercel.app), copy the setup prompt, and paste it into your agent. It installs BrandPreflight and completes any required review setup for you.

```bash
npx skills add mastercoder26/ytautomation -g
```

There is no Codex plugin, marketplace entry, MCP registration, Docker image, or separate local video model to configure.

Install the report CLI when the agent asks, or do it yourself:

```bash
npm install -g brandpreflight
```

Follow any setup prompt before the first review if the agent needs permission to install a system dependency.

## Review a sponsored video

Attach a campaign PDF and finished video, then say:

> Use BrandPreflight to review this sponsored video against the attached campaign brief.

The skill inspects the video and uses this small CLI handoff internally:

```bash
brandpreflight review --brief campaign.pdf --video sponsored-video.mp4
# The agent writes its required findings JSON to findings.json.
brandpreflight score --review bp-review-8F3K --input findings.json
brandpreflight open bp-7XQ4M2
```

The agent supplies observations only. BrandPreflight rejects invalid findings, calculates the deterministic 0–100 score itself, and saves a signed report. You never need to create campaign JSON, artifact IDs, approval-token files, or review-context JSON.

## What it checks

- Campaign requirements extracted from the brief
- Transcript, captions, frames, branding, disclosures, claims, and calls to action
- Versioned evidence with requirement IDs, timestamps, sources, and confidence
- Required-item failures and practical recommended edits
- A browser report with the final score, verdict, and limitations

Raw media stays with the agent unless you explicitly choose otherwise. BrandPreflight stores only the local review session and signed report needed for scoring.

## Development

```bash
npm install
npm run check
npm run package:check
```

MIT License.
