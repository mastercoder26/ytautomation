# MCP reference

Install the published package with `npm install -g brandpreflight`, or run it without installation through:

```bash
npx --yes --package brandpreflight brandpreflight-mcp
```

The package exposes both `brandpreflight` and `brandpreflight-mcp` binaries and includes the review skill under the `brandpreflight/skill` export.

BrandPreflight uses `@modelcontextprotocol/server` v2 over stdio. The entry point is `dist/mcp/index.js`; stdout is reserved for JSON-RPC and diagnostics go to stderr.

## Tools

- `brandpreflight_doctor`: check local prerequisites without network calls.
- `brandpreflight_extract_requirements`: parse typed brief text or a PDF within the allowed root.
- `brandpreflight_prepare_video`: bind the artifact to a digest of the complete campaign, prepare local media, and return only an opaque pre-approval summary.
- `brandpreflight_build_review_packet`: create the untrusted-data BYOM envelope.
- `brandpreflight_score`: validate evidence and calculate the score.

Building a model packet requires a fresh campaign-digest-scoped approval token issued by the local CLI into the same external `BRANDPREFLIGHT_DATA_DIR`. Tokens expire and are consumed once. The packet tool loads transcript text from the signed artifact only after approval; callers cannot supply transcript text themselves. Scoring requires the prepared `artifactId`, and rejects any changed campaign name or requirements.

All input schemas are strict Zod objects. Unknown fields are rejected, aggregate tool text is limited to 2 MB, serialized responses are limited to 4 MB, and the stdio transport closes above 2.5 MB.

## Local policy

`BRANDPREFLIGHT_WORKSPACE_ROOT` constrains imported PDFs/videos. `BRANDPREFLIGHT_DATA_DIR` constrains generated artifacts and must be outside every model-accessible workspace root so the host cannot read signing keys or rewrite manifests. Executable/model paths are read only from environment configuration, not MCP requests.

The server keeps only local private artifacts, signed manifests, and short-lived one-time approvals under the configured data directory. Clients pass campaigns and proposed evidence, but cannot replace the trusted review context.
