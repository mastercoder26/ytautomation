# BrandPreflight operating workflow

## MCP-first path

Use these tools in order for the normal agent-facing flow:

1. `brandpreflight_doctor`
2. `brandpreflight_review` with the user's brief and video
3. inspect the supplied media and return the exact findings contract
4. `brandpreflight_score` with that contract

`brandpreflight_review` owns campaign extraction, artifact preparation, and the private review ID. `brandpreflight_score` writes a signed report and returns an `openCommand`. Do not make the user construct campaign, artifact, approval, or review-context files. The lower-level tools remain only for legacy integrations.

The stdio server reads its local policy from environment variables:

```text
BRANDPREFLIGHT_WORKSPACE_ROOT=/absolute/root/containing/input/files
BRANDPREFLIGHT_DATA_DIR=/absolute/private/artifact/directory
BRANDPREFLIGHT_MEDIA_RUNTIME=docker
BRANDPREFLIGHT_MEDIA_IMAGE=sha256:<64-hex-local-image-id-or-name@registry-digest>
BRANDPREFLIGHT_FFMPEG=ffmpeg
BRANDPREFLIGHT_FFPROBE=ffprobe
BRANDPREFLIGHT_WHISPER_COMMAND=/absolute/path/to/whisper-cli
BRANDPREFLIGHT_WHISPER_MODEL=/absolute/path/to/ggml-model.bin
```

PDF and media preparation require the provided Docker/Podman image (or an equivalent image) pinned by digest and containing Node, FFmpeg/ffprobe, plus whisper.cpp when transcription is enabled. Jobs run offline, read-only, and resource-limited with narrowly scoped mounts. Without both whisper.cpp variables, preparation still produces frames and reports that a local transcript is unavailable.

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
node dist/cli.js review --brief campaign.pdf --video creator.mp4 --data-dir /absolute/private/path/to/artifacts
node dist/cli.js score --review bp-review-8F3K --input findings.json --data-dir /absolute/private/path/to/artifacts
node dist/cli.js open bp-7XQ4M2 --data-dir /absolute/private/path/to/artifacts
```

Every command prints JSON to stdout and diagnostics to stderr. For MCP workflows, use the exact external `BRANDPREFLIGHT_DATA_DIR` for both preparation and approval; the server rejects artifact roots inside the workspace.

## Visual escalation

Use the bounded frame manifest for the first pass. Inspect a focused range when:

- a disclosure may be too small or too brief;
- a competitor product may appear between sampled frames;
- captions, logos, or product packaging are unreadable;
- the transcript says “look here,” “as you can see,” or a similar visual cue;
- an editing/caption issue depends on motion or timing.

When `/watch` exists, run it only for those ambiguous ranges and translate observations into BrandPreflight evidence with honest confidence. It is a host-specific optional integration and must not be installed automatically. If visual inspection is unavailable, use `not_verifiable`.

## Failure handling

- Unsafe/outside-root path: ask the user to move the file under the configured root or change the local root explicitly.
- Missing FFmpeg/ffprobe: report the missing prerequisite; do not fabricate media evidence.
- Missing whisper.cpp: accept a user-provided timestamped transcript or continue visual-only with a limitation.
- Partial/failed processing: copy the affected status into limitations. BrandPreflight caps the score below the ready threshold and returns `inconclusive` when otherwise-satisfied required streams are incomplete.
- Malformed BYOM output: keep valid findings only if the entire boundary schema accepts them; otherwise request corrected structured output.
- Conflicting evidence: prefer the conservative status (`missed`, `violated`, or `at_risk`) and surface the conflict.
