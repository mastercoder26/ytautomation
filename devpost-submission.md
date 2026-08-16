# BrandPreflight

## Inspiration

Sponsored videos often reach the finish line with a last-minute scramble over disclosures, claims, and brand requirements. We wanted a clearer way to check a finished cut against its brief before a creator or brand had to guess.

## What it does

BrandPreflight turns a campaign brief and completed video into a practical review. A creator starts on our site, copies one setup prompt, and pastes it into their coding agent. The agent installs BrandPreflight and handles the local setup. When it receives the brief and finished video, it runs our watch program to work through the video's transcript and frames, then connects timestamped evidence to the campaign requirements. BrandPreflight validates those findings, calculates a repeatable readiness score, and saves a signed local report.

## How we built it

We built the core in TypeScript as a local-first CLI and MCP server, with a small hosted setup page that gives creators the prompt their coding agent needs. The watch program gives the agent a way to inspect the actual video rather than rely on a title or description. An agent can gather evidence from the video, but BrandPreflight validates that evidence against the reviewed artifact and calculates the score itself.

## Challenges we ran into

The difficult part was making AI useful without making it the authority. PDFs, videos, and transcripts are untrusted input, so we isolated media processing, restricted file access, and treated missing evidence as a real limitation instead of a pass.

## Accomplishments that we're proud of

We are proud that the score is deterministic and evidence-backed rather than a black-box opinion. Each result is tied to the local review and leaves a clear record of what passed, what needs work, and why.

## What we learned

A score alone does not build confidence. For a review to be useful, it has to be easy to audit, honest about gaps, and specific enough for someone to make the next edit.

## What's next for Brand PreFlight

Next, we want to strengthen the visual review with OCR and broader brand-placement checks, then support longer videos with background processing. The goal is to expand coverage without giving up the local-first, evidence-driven foundation.
