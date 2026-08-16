# BrandPreflight

BrandPreflight is a local-first quality-assurance foundation for sponsored social video. It converts a typed or PDF campaign brief into structured requirements, prepares timestamped transcript/frame evidence from a creator video, lets the creator's chosen AI model propose findings, and calculates a deterministic Campaign Readiness Score.

This repository currently provides:

- a TypeScript core with strict campaign/evidence schemas and deterministic scoring;
- a local FFmpeg/ffprobe + whisper.cpp-compatible media pipeline;
- a stdio MCP server for use by Codex or another MCP host;
- a creator-facing JSON CLI;
- the project-local `brandpreflight-review` skill;
- offline unit, integration, MCP, security, and CLI tests.

## Local setup

Use Node.js 20, 22, or 24 for the best PDF-parser compatibility.

```bash
npm install
npm run build
node dist/cli.js doctor
```

Media preparation is secure-by-default and refuses to parse creator video on the host account. Configure Docker or Podman plus an image pinned by registry digest that contains FFmpeg/ffprobe. Add whisper.cpp to that image when local transcription is required:

```bash
docker build -f containers/media/Dockerfile -t brandpreflight-media:local .
docker image inspect --format '{{.Id}}' brandpreflight-media:local
export BRANDPREFLIGHT_MEDIA_RUNTIME=docker
export BRANDPREFLIGHT_MEDIA_IMAGE=sha256:<64-hex-image-id-from-inspect>
export BRANDPREFLIGHT_WHISPER_COMMAND=whisper-cli
export BRANDPREFLIGHT_WHISPER_MODEL=/absolute/path/to/ggml-base.en.bin
```

The build installs production dependencies for the image's Linux architecture and bakes in the PDF worker; it never reuses host `node_modules`. At runtime, the pinned image has no networking, a read-only root, dropped capabilities, and CPU/memory/PID limits. Media jobs mount only their private job directory, while PDF jobs have no host bind mounts. No hosted AI API key is required. If whisper.cpp is not configured, BrandPreflight still extracts bounded frames and reports the missing transcript as a limitation.

Run `npm run test:container` on a machine with Docker, or set `BRANDPREFLIGHT_MEDIA_RUNTIME=podman` first, to build the image and execute the real PDF stdin/native-dependency smoke test.

## CLI

```bash
node dist/cli.js brief --pdf campaign.pdf --campaign-id launch-01 --name "Launch" --root .
node dist/cli.js prepare --campaign campaign.json --video creator.mp4 --root . --data-dir /absolute/private/path/brandpreflight-artifacts
node dist/cli.js approve --campaign campaign.json --root . --data-dir /absolute/private/path/brandpreflight-artifacts
node dist/cli.js packet --input examples/review-input.example.json --root .
node dist/cli.js score --input examples/assessment.example.json --root .
node dist/cli.js clean --artifact job-ABC123 --data-dir .brandpreflight --yes true
```

Run `node dist/cli.js --help` for the complete command list.

## MCP configuration

Build first, then add the server to the host's MCP configuration using absolute paths:

```toml
[mcp_servers.brandpreflight]
command = "node"
args = ["/absolute/path/to/ytautomation/dist/mcp/index.js"]
env = {
  BRANDPREFLIGHT_WORKSPACE_ROOT = "/absolute/path/containing/briefs-and-videos",
  BRANDPREFLIGHT_DATA_DIR = "/absolute/private/path/brandpreflight-artifacts",
  BRANDPREFLIGHT_MEDIA_RUNTIME = "docker",
  BRANDPREFLIGHT_MEDIA_IMAGE = "registry.example/brandpreflight-media@sha256:<64-hex-digest>",
  BRANDPREFLIGHT_WHISPER_COMMAND = "whisper-cli",
  BRANDPREFLIGHT_WHISPER_MODEL = "/absolute/path/to/model.bin"
}
```

The server exposes `brandpreflight_doctor`, `brandpreflight_extract_requirements`, `brandpreflight_prepare_video`, `brandpreflight_build_review_packet`, and `brandpreflight_score`, plus the `brandpreflight_review` prompt.

Keep `BRANDPREFLIGHT_DATA_DIR` outside `BRANDPREFLIGHT_WORKSPACE_ROOT`; the MCP refuses startup otherwise. This keeps the local signing key and one-time approvals outside the model-accessible file tree.

## Privacy and security posture

- Raw briefs, videos, audio, transcripts, frames, and reports remain local by default.
- Native tools run with fixed argument arrays in a pinned, offline, resource-limited container; no shell is used.
- Imported files must be regular, non-symlink files under configured roots.
- PDF/video size, duration, dimensions, output, process time, and frame counts are bounded.
- Artifact content is treated as untrusted prompt data.
- AI findings are validated; the score is calculated locally and cannot be supplied by a model.
- The receiving MCP model cannot self-authorize evidence sharing or supply its own scoring context; one-time approvals and signed artifact manifests bind both operations locally.
- `.brandpreflight/` and `.env` are ignored by Git.
- Successful jobs delete their private video/audio working copies; retained frame/transcript artifacts can be removed explicitly with `clean`.

See [the architecture notes](docs/architecture.md), [scoring contract](docs/scoring.md), and [MCP reference](docs/mcp.md).

## Verification

```bash
npm run check
python3 /path/to/skill-creator/scripts/quick_validate.py skills/brandpreflight-review
```

The test gate requires at least 80% coverage for statements, branches, functions, and lines.
