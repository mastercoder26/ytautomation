# BrandPreflight
<img width="2527" height="995" alt="image" src="https://github.com/user-attachments/assets/eb6c7cd8-6551-465c-8faf-52dd1d704837" />

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
# The command returns a review ID and the exact /watch command for the video.
# The agent writes its required findings JSON to findings.json.
brandpreflight score --review bp-review-8F3K --input findings.json
brandpreflight open bp-7XQ4M2
```

The agent supplies observations only. BrandPreflight rejects invalid findings, calculates the deterministic 0–100 score itself, and saves a signed report. You never need to create campaign JSON, artifact IDs, approval-token files, or review-context JSON.

## How video watching works

You do not need to upload a subtitle file. During a review, the coding agent runs the `watch` program included in the setup against the finished video. It checks available captions, samples timestamped frames, and can create a timestamped local transcript from the audio with Whisper when captions are unavailable. This gives the agent evidence for spoken disclosures, on-screen branding, claims, and calls to action.

The video stays local by default. If transcription or visual coverage cannot be completed, BrandPreflight records that as a limitation and does not treat the related requirement as fully verified.

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
npm run site:dev
npm run check
npm run package:check
```

The hosted BrandPreflight homepage is a Vite-powered React app in `site/`. The hero
loads the shared Spline scene from the portfolio reference with reduced-motion and
off-screen pause handling. `npm run site:build` produces the Vercel output in
`site/dist`.

MIT License.
