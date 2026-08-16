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
- FFmpeg, ffprobe, and whisper.cpp are fixed local executables configured outside tool requests. Jobs are serialized, time-bounded, frame-scaled/capped, disk-budgeted, and removed on failure.
- PDF text extraction runs in a separate Node process with filesystem writes, networking, workers, and child processes disabled by the Node permission model; only the known parser addon is allowed.
- The AI model receives a prompt-injection-resistant review envelope and returns proposed evidence.
- Evidence schemas reject unknown requirement IDs, malformed timestamps, oversized excerpts, and unknown fields.
- Readiness scoring is local, transparent, and reproducible.

## Current MVP boundaries

The foundation is synchronous and intended for short/medium local videos. It does not include a hosted web UI, accounts, remote artifact storage, OCR, background jobs, or direct provider API adapters yet. Those belong in later phases after the evidence contract is proven with creators.
