---
name: brandpreflight-setup
description: Install and configure BrandPreflight so this agent can review a sponsored video against an attached campaign brief and return a signed local report.
---

# BrandPreflight setup

The user explicitly asked you to set up BrandPreflight in the current project. Do not ask them to create campaign JSON, artifact files, or approval tokens.

1. Identify the current project directory and install the package locally:

```bash
npm install brandpreflight
```

2. For Codex, register and install the bundled plugin from this local package:

```bash
codex plugin marketplace add ./node_modules/brandpreflight/.agents/plugins
codex plugin add brandpreflight@brandpreflight
```

For another MCP-capable host, register this local command instead:

```text
command: npx
args: ["--yes", "--package", "brandpreflight", "brandpreflight-mcp"]
```

3. Check readiness without changing the machine:

```bash
npx brandpreflight doctor
```

4. If Docker or Podman is available, build BrandPreflight's local media image and configure the current shell/host with its immutable image ID. Do not silently install Docker, FFmpeg, yt-dlp, or a host-specific `/watch` skill. Explain any missing prerequisite and ask before making a machine-level change.

```bash
docker build -f ./node_modules/brandpreflight/containers/media/Dockerfile -t brandpreflight-media:local ./node_modules/brandpreflight
docker image inspect --format '{{.Id}}' brandpreflight-media:local
```

Set `BRANDPREFLIGHT_MEDIA_RUNTIME=docker` and `BRANDPREFLIGHT_MEDIA_IMAGE` to the inspected image ID in the MCP host configuration. Configure `BRANDPREFLIGHT_WORKSPACE_ROOT` to this project and `BRANDPREFLIGHT_DATA_DIR` to a private directory outside the workspace.

5. Confirm setup concisely. Then, when the user supplies a campaign PDF and finished video, use BrandPreflight: call `brandpreflight_review`, inspect the supplied media, return strict version-1 findings, call `brandpreflight_score`, and show the signed report URL or `brandpreflight open <reportId>` command. Never supply the score yourself.
