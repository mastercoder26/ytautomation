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

Install FFmpeg/ffprobe separately for media preparation. For local transcription, build [whisper.cpp](https://github.com/ggml-org/whisper.cpp), download a compatible local model, and set:

```bash
export BRANDPREFLIGHT_WHISPER_COMMAND=/absolute/path/to/whisper-cli
export BRANDPREFLIGHT_WHISPER_MODEL=/absolute/path/to/ggml-base.en.bin
```

No hosted AI API key is required. If whisper.cpp is not configured, BrandPreflight still extracts bounded frames/audio and reports the missing transcript as a limitation.

## CLI

```bash
node dist/cli.js brief --pdf campaign.pdf --campaign-id launch-01 --name "Launch" --root .
node dist/cli.js prepare --video creator.mp4 --root . --data-dir .brandpreflight
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
  BRANDPREFLIGHT_WHISPER_COMMAND = "/absolute/path/to/whisper-cli",
  BRANDPREFLIGHT_WHISPER_MODEL = "/absolute/path/to/model.bin"
}
```

The server exposes `brandpreflight_doctor`, `brandpreflight_extract_requirements`, `brandpreflight_prepare_video`, `brandpreflight_build_review_packet`, and `brandpreflight_score`, plus the `brandpreflight_review` prompt.

## Privacy and security posture

- Raw briefs, videos, audio, transcripts, frames, and reports remain local by default.
- Native tools are spawned with fixed argument arrays and no shell.
- Imported files must be regular, non-symlink files under configured roots.
- PDF/video size, duration, dimensions, output, process time, and frame counts are bounded.
- Artifact content is treated as untrusted prompt data.
- AI findings are validated; the score is calculated locally and cannot be supplied by a model.
- `.brandpreflight/` and `.env` are ignored by Git.
- Successful jobs delete their private video/audio working copies; retained frame/transcript artifacts can be removed explicitly with `clean`.

See [the architecture notes](docs/architecture.md), [scoring contract](docs/scoring.md), and [MCP reference](docs/mcp.md).

## Verification

```bash
npm run check
python3 /path/to/skill-creator/scripts/quick_validate.py skills/brandpreflight-review
```

The test gate requires at least 80% coverage for statements, branches, functions, and lines.
