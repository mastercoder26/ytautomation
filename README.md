# BrandPreflight

<img width="2527" height="995" alt="BrandPreflight campaign readiness report" src="https://github.com/user-attachments/assets/eb6c7cd8-6551-465c-8faf-52dd1d704837" />

### Catch sponsored-content mistakes before the video reaches the brand.

BrandPreflight reviews a finished sponsored video against its campaign brief, validates timestamped evidence, calculates a deterministic Campaign Readiness Score, and opens a signed local report with the exact edits to make next.

[Try the guided setup](https://brandpreflight.vercel.app) | [View the source](https://github.com/mastercoder26/ytautomation) | [Social Media Automation Hackathon](https://social-media-automation-hacks.devpost.com/)

## The creator problem

A sponsored video can be creatively finished and still fail review because a disclosure is missing, an approved claim is worded incorrectly, a promo code is wrong, or required branding never appears on screen. Finding those issues means repeatedly scrubbing through the video while cross-checking a long campaign brief.

BrandPreflight automates that final comparison while there is still time to fix the cut. It turns the brief and video into a traceable result instead of another manual checklist.

## What it delivers

- A working review ID and a real saved report, not a mockup or generated summary
- A 0 to 100 Campaign Readiness Score with `ready`, `needs_changes`, `blocked`, or `inconclusive`
- Requirement-level results with evidence source, timestamp, observation, and confidence
- Concrete edit recommendations for missed or at-risk requirements
- Honest limitations when audio, visuals, or evidence cannot be verified
- A local browser report whose contents are signed to detect tampering

## How it works

1. **Set up once.** The creator opens the [setup site](https://brandpreflight.vercel.app), selects a coding agent, and copies one prompt. The agent installs the BrandPreflight skill and CLI.
2. **Provide two files.** The creator attaches the campaign brief and finished video, then asks the agent to run a BrandPreflight review.
3. **Extract requirements.** `brandpreflight review` reads the brief, normalizes requirements such as disclosures, approved claims, prohibited claims, promo codes, branding, and calls to action, then creates a private review ID.
4. **Inspect the video.** The agent uses its video-review capability to inspect captions, transcript segments, and timestamped frames. It proposes findings using only known requirement IDs and bounded timestamps.
5. **Validate and score.** `brandpreflight score` rejects malformed or unsupported findings. BrandPreflight, not the model, applies the scoring rules and determines the verdict.
6. **Open the result.** BrandPreflight saves a signed report and returns a command that opens the results in a local browser with the score, evidence, limitations, and recommended edits.

The agent handles observation. BrandPreflight remains the authority for validation, scoring, verdicts, and report integrity.

```text
Campaign brief -> normalized requirements ------+
                                                  +-> validated evidence -> score -> signed report
Finished video -> transcript + timestamped frames+
```

## Try a review

The simplest path is the [guided setup site](https://brandpreflight.vercel.app). You can also install the pieces directly:

```bash
npx skills add mastercoder26/ytautomation -g
npx skills add bradautomates/claude-video -g
npm install -g brandpreflight
```

Attach a campaign brief and finished video, then ask your agent:

> Use BrandPreflight to review this sponsored video against the attached campaign brief.

Behind the scenes, the workflow is intentionally small:

```bash
brandpreflight review --brief campaign.pdf --video sponsored-video.mp4
# The agent watches the video and writes strict findings JSON.
brandpreflight score --review bp-review-8F3K --input findings.json
brandpreflight open bp-7XQ4M2
```

The creator only supplies the brief and video. BrandPreflight manages requirement IDs, review IDs, scoring, and report storage.

## Deterministic scoring

Campaign requirements are weighted by importance:

| Priority | Weight |
| --- | ---: |
| Required | 5 |
| High | 3 |
| Normal | 1 |

`satisfied` earns full credit, `at_risk` earns 25 percent, and `missed`, `violated`, or `not_verifiable` earn no credit. A missing required disclosure or a required prohibited-claim violation caps the score at 49 and returns `blocked`. A `ready` verdict requires a score of at least 85 with no missed or at-risk items.

This prevents incomplete evidence from becoming a misleading pass. The same validated findings always produce the same score.

## Why this stands out

| Judging criterion | Evidence in BrandPreflight |
| --- | --- |
| **Functionality, 30%** | The end-to-end CLI extracts requirements, accepts timestamped findings, calculates a score, saves a signed report, and opens a working results screen. |
| **Real-world usefulness, 30%** | It targets a costly creator workflow: checking a finished sponsored video against a brief before delivery. The output points directly to the next edit. |
| **Creativity, 20%** | It separates flexible AI observation from deterministic software authority. The model can find evidence, but it cannot invent requirements or choose its own score. |
| **Technical execution, 20%** | A shared TypeScript core powers the CLI and MCP server. Strict Zod schemas, bounded inputs, local report signing, unit tests, integration tests, and end-to-end tests protect the workflow. |

## Technical design

- **TypeScript domain core:** requirement normalization, evidence validation, weighted scoring, verdict rules, and report generation
- **Agent skill:** a portable workflow that tells compatible coding agents how to inspect media and return the strict findings contract
- **CLI and MCP interfaces:** two ways to call the same validation and scoring modules
- **Zod contracts:** unknown fields, invalid statuses, malformed timestamps, and unknown requirement IDs are rejected
- **Signed local reports:** every saved report receives an HMAC signature and is verified again before display
- **Safe local viewer:** reports are served only on loopback with a restrictive content security policy

Raw video stays local by default. Brief text, transcripts, captions, filenames, and visual descriptions are treated as untrusted data, never as instructions. If evidence is incomplete, BrandPreflight reports the gap instead of assuming compliance.

## Run from source

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/mastercoder26/ytautomation.git
cd ytautomation
npm install
npm run build
```

Start the setup site locally:

```bash
npm run site:dev
```

Run the complete verification suite:

```bash
npm run check
```

The suite covers scoring, evidence validation, file boundaries, the CLI workflow, MCP tools, the report viewer, and the setup site. The current verification passes 88 tests with 96.69 percent line coverage and 80.78 percent branch coverage.

## Current limitations

- BrandPreflight is a preflight assistant, not legal advice or a replacement for final brand approval.
- Results depend on the parts of the video the agent can inspect. Missing coverage is reported as a limitation.
- Automated OCR and focused re-checks after an edit are planned next.

## Team

Solo project by **Akhil Konduru**, responsible for product design, architecture, implementation, testing, and the demo experience.

Built during the Social Media Automation Hackathon. Licensed under the [MIT License](LICENSE).
