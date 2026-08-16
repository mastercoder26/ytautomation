# BrandPreflight operating workflow

## MCP-first path

Use these tools in order:

1. `brandpreflight_doctor`
2. `brandpreflight_extract_requirements`
3. `brandpreflight_prepare_video`
4. `brandpreflight_build_review_packet`
5. `brandpreflight_score`

The stdio server reads its local policy from environment variables:

```text
BRANDPREFLIGHT_WORKSPACE_ROOT=/absolute/root/containing/input/files
BRANDPREFLIGHT_DATA_DIR=/absolute/private/artifact/directory
BRANDPREFLIGHT_FFMPEG=ffmpeg
BRANDPREFLIGHT_FFPROBE=ffprobe
BRANDPREFLIGHT_WHISPER_COMMAND=/absolute/path/to/whisper-cli
BRANDPREFLIGHT_WHISPER_MODEL=/absolute/path/to/ggml-model.bin
```

Only the first two variables are generally required. Without both whisper.cpp variables, preparation still produces frames and audio but reports that a local transcript is unavailable.

Minimal MCP registration after `npm run build`:

```toml
[mcp_servers.brandpreflight]
command = "node"
args = ["/absolute/path/to/ytautomation/dist/mcp/index.js"]
env = {
  BRANDPREFLIGHT_WORKSPACE_ROOT = "/absolute/path/to/creator-assets",
  BRANDPREFLIGHT_DATA_DIR = "/absolute/private/path/to/artifacts"
}
```

## CLI fallback

From the repository root after `npm install && npm run build`:

```bash
node dist/cli.js doctor
node dist/cli.js brief --pdf campaign.pdf --campaign-id launch-01 --name "Launch" --root .
node dist/cli.js prepare --video creator.mp4 --root . --data-dir .brandpreflight
node dist/cli.js packet --input review-input.json --root .
node dist/cli.js score --input assessment.json --root .
node dist/cli.js clean --artifact job-ABC123 --data-dir .brandpreflight --yes true
```

Every command prints JSON to stdout and diagnostics to stderr. Keep `.brandpreflight/` out of Git.

## Visual escalation

Use the bounded frame manifest for the first pass. Inspect a focused range when:

- a disclosure may be too small or too brief;
- a competitor product may appear between sampled frames;
- captions, logos, or product packaging are unreadable;
- the transcript says “look here,” “as you can see,” or a similar visual cue;
- an editing/caption issue depends on motion or timing.

When `/watch` exists, run it only for those ambiguous ranges and translate observations into BrandPreflight evidence with honest confidence. If visual inspection is unavailable, use `not_verifiable`.

## Failure handling

- Unsafe/outside-root path: ask the user to move the file under the configured root or change the local root explicitly.
- Missing FFmpeg/ffprobe: report the missing prerequisite; do not fabricate media evidence.
- Missing whisper.cpp: accept a user-provided timestamped transcript or continue visual-only with a limitation.
- Partial/failed processing: copy the affected `transcriptStatus` or `visualStatus` into the user-visible limitations and scope any positive verdict to streams actually reviewed.
- Malformed BYOM output: keep valid findings only if the entire boundary schema accepts them; otherwise request corrected structured output.
- Conflicting evidence: prefer the conservative status (`missed`, `violated`, or `at_risk`) and surface the conflict.
