---
name: brandpreflight-setup
description: Install and configure BrandPreflight so this agent can review a sponsored video against an attached campaign brief and return a signed local report.
---

# BrandPreflight setup

The user explicitly asked you to set up BrandPreflight in the current project. Do not ask them to create campaign JSON, artifact files, approval tokens, a plugin marketplace, Docker images, or MCP configuration.

1. Install the two portable skills globally for the active agent host. The watcher is responsible for downloading videos, captions, frames, and optional Whisper transcription.

```bash
npx skills add mastercoder26/ytautomation -g
npx skills add bradautomates/claude-video -g
```

2. Install BrandPreflight's small local scoring/report CLI:

```bash
npm install -g brandpreflight
```

3. Confirm setup concisely. Then, when the user supplies a campaign PDF and finished video, run `/watch <video>` to inspect the transcript and frames, run `brandpreflight review --brief <brief> --video <video>`, return strict version-1 findings, run `brandpreflight score --review <reviewId> --input <findings.json>`, and show `brandpreflight open <reportId>`. Never supply the score yourself.
