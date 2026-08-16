# BrandPreflight workflow

This is a two-skill flow: [`/watch`](https://github.com/bradautomates/claude-video) observes a local video, and BrandPreflight scores those observations against the campaign brief.

1. Run `brandpreflight review --brief <brief> --video <video>`. It extracts requirements and returns a private `reviewId` plus the exact findings contract.
2. Run `/watch <video>`. Inspect captions, transcript, frames, branding, disclosure, claims, and any ambiguous timestamps.
3. Create the strict findings JSON. It must contain only known requirement IDs and must not contain a score.
4. Run `brandpreflight score --review <reviewId> --input findings.json`. It validates the findings, calculates the score, and saves a signed report.
5. Run `brandpreflight open <reportId>` or present the returned open command.

The user supplies only the brief and video. Do not ask them for campaign JSON, artifacts, approval tokens, review-context JSON, Docker, or a local transcription model.

## Failure handling

- If `/watch` cannot inspect part of the video, record that as a limitation and use `not_verifiable` for the affected requirement.
- If a PDF cannot be read, ask for a text-exported brief or a readable PDF; do not make up requirements.
- If a requirement lacks timestamped support, use `not_verifiable`, not `satisfied`.
- If findings fail schema validation, correct the JSON rather than bypassing BrandPreflight.
