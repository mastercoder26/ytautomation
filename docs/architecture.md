# Architecture

BrandPreflight separates model judgment from scoring authority.

```text
brief text/PDF -> normalized requirements -----+
                                                 +-> validated evidence -> deterministic score/report
video -> ffprobe/FFmpeg -> transcript + frames -+
                              |
                              +-> creator-selected model or human review
```

The core is pure TypeScript. The CLI and stdio MCP server are thin interfaces over the same modules.

## Trust boundaries

- Brief/media contents are untrusted input.
- File paths are accepted only at import and constrained to configured roots.
- Inputs are opened with no-follow semantics and copied into random, private job directories before native processing; checked mutable paths are never reopened by FFmpeg.
- FFmpeg, ffprobe, and whisper.cpp run inside a pinned Docker/Podman image with networking disabled, a read-only root, dropped capabilities, and CPU/memory/PID limits. Only the private job directory is mounted. Jobs are serialized, time-bounded, two-dimension frame-scaled/capped, write-budgeted during processing, and removed on failure.
- PDF text extraction runs in the pinned offline container with Linux-native production dependencies and a baked-in worker. It has no host bind mounts, a 512 MB memory limit, one CPU, a 32-process cap, a 256 MB V8 heap, a read-only root, a wall-clock timeout, and Node permissions that disable filesystem writes, networking, workers, and child processes.
- The AI model receives a prompt-injection-resistant review envelope and returns proposed evidence.
- Evidence schemas reject unknown requirement IDs, malformed timestamps, oversized excerpts, and unknown fields.
- One-time full-campaign-digest approval tokens are issued outside MCP before transcript evidence can be released to the host model.
- MCP scoring derives the complete campaign binding, duration, transcript, and processing completeness from a signed local artifact manifest.
- Readiness scoring is local, transparent, and reproducible.

## Current MVP boundaries

The foundation is synchronous and intended for short/medium local videos. It does not include a hosted web UI, accounts, remote artifact storage, OCR, background jobs, or direct provider API adapters yet. Those belong in later phases after the evidence contract is proven with creators.
