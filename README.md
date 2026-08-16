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

## What you can do

### Check a campaign brief

Use a PDF or a text file. BrandPreflight extracts requirements such as exact phrases, disclosures, promo codes, calls to action, prohibited claims, branding, captions, and editing rules.

```bash
brandpreflight brief \
  --pdf campaign.pdf \
  --campaign-id acme-launch \
  --name "Acme Launch" \
  --root . > campaign.json
```

For a text brief, replace `--pdf campaign.pdf` with `--text brief.txt`.

Always open `campaign.json` and fix anything ambiguous before continuing.

### Analyze a finished video locally

```bash
brandpreflight prepare \
  --campaign campaign.json \
  --video creator-video.mp4 \
  --root . \
  --data-dir /absolute/private/brandpreflight-artifacts
```

The local media pipeline creates:

- video metadata and duration;
- bounded audio and video frames through FFmpeg;
- a timestamped whisper.cpp transcript when configured;
- a signed artifact manifest tied to the exact campaign.

### Use your own AI model

BrandPreflight does not require a hosted AI provider. Your chosen model reviews the transcript and visual observations; BrandPreflight supplies the review packet and validates the answer.

Before transcript evidence is shared, approve it explicitly:

```bash
brandpreflight approve \
  --campaign campaign.json \
  --root . \
  --data-dir /absolute/private/brandpreflight-artifacts
```

The approval is one-time and campaign-specific. The AI model cannot approve its own access or invent the final score.

### Inspect visual issues

Use the extracted frames first. If your agent host supports `/watch`, use it to inspect an exact timestamp for issues like:

- missing or incorrect branding;
- competitor products;
- disclosure placement;
- caption problems;
- editing mistakes;
- visual claims that are not supported.

`/watch` is optional. It is not required by the local runtime.

### Get a readiness score

The final result includes:

- a score from 0–100;
- `ready`, `needs_changes`, `blocked`, or `inconclusive`;
- satisfied, missed, and at-risk requirements;
- timestamped evidence;
- specific changes to make before submission;
- limitations for anything that was not fully reviewed.

The score is calculated locally. A model cannot simply return “ready.”

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
- `brandpreflight_extract_requirements` — parse a brief;
- `brandpreflight_prepare_video` — create signed local evidence;
- `brandpreflight_build_review_packet` — build the AI review packet after approval;
- `brandpreflight_score` — validate findings and calculate the score.

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

## Safety and privacy

- Briefs, videos, transcripts, frames, and reports stay local by default.
- Native tools run in an offline, resource-limited container.
- The data directory must be outside the model-accessible workspace.
- Artifact manifests and approvals are signed locally.
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
