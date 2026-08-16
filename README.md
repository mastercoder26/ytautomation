# BrandPreflight

BrandPreflight checks sponsored videos before you send them to a brand.

You provide a campaign brief and a finished video. BrandPreflight turns the brief into checks, creates transcript and frame evidence, lets your AI model review the content, and calculates a local Campaign Readiness Score.

```text
brief → requirements → transcript + frames → AI review → score + fixes
```

## Install

The package is live on npm:

```bash
npm install -g brandpreflight
brandpreflight doctor
```

Or run it once with no global install:

```bash
npx --yes brandpreflight doctor
```

## Agent-first workflow

Install the Codex plugin, attach the campaign PDF and finished video, then tell your agent:

> Use BrandPreflight to review this sponsored video against the attached campaign brief.

The skill calls `brandpreflight_review`, which extracts requirements, processes the video locally, and returns a private review ID plus the strict JSON shape for agent findings. The agent reviews transcript, frames, captions, disclosure, branding, and claims; it never supplies a score. `brandpreflight_score` validates those findings against the signed local evidence, calculates the score, and saves a signed browser report.

The equivalent human/agent CLI flow is:

```bash
brandpreflight review --brief campaign.pdf --video sponsored-video.mp4
# write the returned versioned findings JSON to findings.json
brandpreflight score --review bp-review-8F3K --input findings.json
brandpreflight open bp-7XQ4M2
```

No user-authored `campaign.json`, artifact ID, approval-token file, or review-context JSON is required. Legacy low-level commands remain available for integrations that already use them.

## MCP setup

Use BrandPreflight from Codex or another MCP host without installing it globally:

```toml
[mcp_servers.brandpreflight]
command = "npx"
args = ["--yes", "--package", "brandpreflight", "brandpreflight-mcp"]
env = {
  BRANDPREFLIGHT_WORKSPACE_ROOT = "/absolute/path/containing/briefs-and-videos",
  BRANDPREFLIGHT_DATA_DIR = "/absolute/private/brandpreflight-artifacts",
  BRANDPREFLIGHT_MEDIA_RUNTIME = "docker",
  BRANDPREFLIGHT_MEDIA_IMAGE = "sha256:<immutable-image-id>"
}
```

The MCP server provides:

- `brandpreflight_doctor` — check local tools;
- `brandpreflight_review` — start a review directly from a brief and video;
- `brandpreflight_score` — validate strict findings, calculate a score, and save a signed report;
- legacy extraction, preparation, packet, and score tools for existing integrations.

The bundled agent skill is included in the npm package:

```bash
brandpreflight skill
```

## Media setup

Secure video and PDF processing requires Docker or Podman. Build the pinned image from the repository:

```bash
docker build -f containers/media/Dockerfile -t brandpreflight-media:local .
docker image inspect --format '{{.Id}}' brandpreflight-media:local

export BRANDPREFLIGHT_MEDIA_RUNTIME=docker
export BRANDPREFLIGHT_MEDIA_IMAGE=sha256:<image-id-from-inspect>
```

For local transcription, also configure whisper.cpp in the image:

```bash
export BRANDPREFLIGHT_WHISPER_COMMAND=whisper-cli
export BRANDPREFLIGHT_WHISPER_MODEL=/absolute/path/to/ggml-base.en.bin
```

Without whisper.cpp, BrandPreflight can still inspect frames but will mark transcript checks incomplete.

If the agent host offers the separate `/watch` skill, it can help with an ambiguous focused timestamp. BrandPreflight detects and documents readiness through `doctor`; it never silently installs FFmpeg, yt-dlp, or another agent host's skill. Those setup actions affect the local machine and must be explicitly authorized.

## Safety and privacy

- Briefs, videos, transcripts, frames, and reports stay local by default.
- Native tools run in an offline, resource-limited container.
- The data directory must be outside the model-accessible workspace.
- Artifact manifests, review sessions, and final reports are signed locally.
- Evidence timestamps, sources, excerpts, and campaign requirements are validated.
- Incomplete processing produces an inconclusive or limited result instead of a false “ready.”

## JavaScript API

Use the deterministic core from JavaScript or TypeScript:

```js
import { calculateReadiness, digestCampaign } from "brandpreflight/core";
```

## Development

```bash
npm install
npm run check
npm run package:check
```

Run the real container smoke test on a machine with Docker or Podman:

```bash
npm run test:container
```

## Current scope

BrandPreflight is the local processing, scoring, skill, and MCP foundation. It does not yet include a hosted dashboard, accounts, billing, or a built-in AI provider. You bring the model; BrandPreflight provides the specialized video pipeline and sponsored-content review workflow.

MIT License.
