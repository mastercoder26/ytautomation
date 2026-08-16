# BrandPreflight

BrandPreflight helps creators check sponsored videos before sending them to a brand.

You give it:

- a campaign brief as text or PDF;
- a finished video;
- the AI model you want to use for the review.

It gives you a Campaign Readiness Score, timestamped evidence, and a short list of edits to make before submission.

```text
campaign brief → structured requirements → transcript + frames → AI review → validated score
```

## What it checks

BrandPreflight can check requirements such as:

- required talking points and exact phrases;
- disclosures such as `#ad`;
- promo codes and calls to action;
- prohibited claims or competitor mentions;
- logos, product placement, captions, branding, and editing issues;
- anything else you describe as a campaign requirement.

The AI model proposes findings. BrandPreflight validates the evidence and calculates the score locally, so a model cannot simply claim that a video is ready.

## Install

The package is prepared for npm distribution and includes both commands:

```bash
npm install -g brandpreflight
brandpreflight doctor
```

For a one-off run:

```bash
npx --yes brandpreflight doctor
```

The npm release workflow is in `.github/workflows/publish.yml`. Until the first registry release, use the local setup below.

## Local setup

Requirements:

- Node.js 20 or newer;
- Docker or Podman for secure media and PDF processing;
- FFmpeg and ffprobe inside the pinned media image;
- whisper.cpp is optional but required for a local transcript.

From this repository:

```bash
npm install
npm run build
node dist/cli.js doctor
```

Build the media image and pin its immutable image ID:

```bash
docker build -f containers/media/Dockerfile -t brandpreflight-media:local .
docker image inspect --format '{{.Id}}' brandpreflight-media:local

export BRANDPREFLIGHT_MEDIA_RUNTIME=docker
export BRANDPREFLIGHT_MEDIA_IMAGE=sha256:<image-id-from-inspect>
```

Add these optional variables if whisper.cpp is installed in your image:

```bash
export BRANDPREFLIGHT_WHISPER_COMMAND=whisper-cli
export BRANDPREFLIGHT_WHISPER_MODEL=/absolute/path/to/ggml-base.en.bin
```

## The simple CLI workflow

### 1. Turn the brief into requirements

For a PDF:

```bash
node dist/cli.js brief \
  --pdf campaign.pdf \
  --campaign-id acme-launch \
  --name "Acme Launch" \
  --root . > campaign.json
```

For a typed brief saved as a text file, use `--text brief.txt` instead of `--pdf campaign.pdf`.

Open `campaign.json` and fix any ambiguous requirement before reviewing the video. Each requirement specifies what to check and whether it is transcript, visual, both, or manual.

### 2. Prepare the video

```bash
node dist/cli.js prepare \
  --campaign campaign.json \
  --video creator-video.mp4 \
  --root . \
  --data-dir /absolute/private/brandpreflight-artifacts
```

This creates a local artifact containing:

- video metadata;
- bounded audio and frame evidence;
- a timestamped transcript when whisper.cpp is configured;
- a signed manifest bound to the exact campaign requirements.

### 3. Approve transcript sharing

Approval is explicit and happens outside the AI host:

```bash
node dist/cli.js approve \
  --campaign campaign.json \
  --root . \
  --data-dir /absolute/private/brandpreflight-artifacts
```

The approval token is one-time and campaign-specific. Raw transcript and frame paths are not exposed before approval.

### 4. Review with your chosen AI model

The MCP workflow is recommended for this step. The server builds a review packet from the signed local artifact, and your model analyzes:

- transcript requirements;
- visual observations;
- exact phrases and disclosures;
- risks and recommended changes.

Use the extracted frames first. If your agent host provides `/watch`, use it to inspect an exact timestamp when a visual finding needs more context. `/watch` is optional; it is not required by the local runtime.

The model returns findings. It does not control the final score.

### 5. Calculate the score

BrandPreflight validates every finding against the local artifact and returns:

- a score from 0 to 100;
- `ready`, `needs_changes`, `blocked`, or `inconclusive`;
- satisfied and missed requirements;
- timestamped evidence;
- concrete changes before submission;
- limitations for any unreviewed media.

## MCP setup

The MCP server works with Codex or another MCP host. Without a global install:

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

The server exposes:

- `brandpreflight_doctor` — check local prerequisites;
- `brandpreflight_extract_requirements` — parse typed or PDF briefs;
- `brandpreflight_prepare_video` — create signed local evidence;
- `brandpreflight_build_review_packet` — build the model-facing packet after approval;
- `brandpreflight_score` — validate findings and calculate the readiness score.

The bundled agent skill is available from the installed package with:

```bash
brandpreflight skill
```

It prints the path to `brandpreflight-review/SKILL.md`.

## Privacy and safety

- Briefs, videos, transcripts, frames, and reports stay local by default.
- Native media tools run in a pinned, offline, resource-limited container.
- The data directory must be outside the model-accessible workspace.
- Approval tokens and artifact manifests are signed locally.
- Evidence timestamps, sources, excerpts, and campaign digests are validated.
- The model cannot provide its own score or replace the trusted review context.
- If transcription or visual processing fails, the result is marked incomplete instead of silently treated as ready.

## JavaScript API

The package exposes the deterministic core at `brandpreflight/core`:

```js
import { calculateReadiness, digestCampaign } from "brandpreflight/core";
```

Use this for integrations that want the campaign schemas, campaign binding, evidence validation, envelope construction, or local scoring without calling the CLI.

## Development

```bash
npm run check
npm run package:check
```

The test suite covers the core scorer, media adapters, MCP server, CLI, consent flow, provenance checks, and security boundaries. The real container smoke test is available when Docker or Podman is installed:

```bash
npm run test:container
```

## Current scope

BrandPreflight is the local processing and review foundation. It does not yet include a hosted dashboard, accounts, billing, or a built-in AI provider. You bring the model; BrandPreflight supplies the specialized video pipeline, evidence contract, scoring system, MCP tools, and sponsored-content workflow.

See [the architecture notes](docs/architecture.md), [the scoring contract](docs/scoring.md), and [the MCP reference](docs/mcp.md) for implementation details.

## License

MIT
