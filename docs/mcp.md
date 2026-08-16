# MCP reference

BrandPreflight uses `@modelcontextprotocol/server` v2 over stdio. The entry point is `dist/mcp/index.js`; stdout is reserved for JSON-RPC and diagnostics go to stderr.

## Tools

- `brandpreflight_doctor`: check local prerequisites without network calls.
- `brandpreflight_extract_requirements`: parse typed brief text or a PDF within the allowed root.
- `brandpreflight_prepare_video`: probe, extract audio/frames, and optionally invoke local whisper.cpp.
- `brandpreflight_build_review_packet`: create the untrusted-data BYOM envelope.
- `brandpreflight_score`: validate evidence and calculate the score.

Building a model packet requires `consent.shareWithCurrentMcpHost=true`. Scoring requires `reviewContext.durationMs` and `reviewContext.transcript` so evidence timestamps and excerpts can be checked.

All input schemas are strict Zod objects. Unknown fields are rejected by the MCP SDK before the handler runs.

## Local policy

`BRANDPREFLIGHT_WORKSPACE_ROOT` constrains imported PDFs/videos. `BRANDPREFLIGHT_DATA_DIR` constrains generated artifacts. Executable/model paths are read only from environment configuration, not MCP requests.

The server is intentionally stateless in the MVP. Clients pass structured campaigns and evidence between calls, which makes results auditable and avoids cross-campaign artifact leakage.
