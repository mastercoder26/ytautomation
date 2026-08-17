# BrandPreflight

> Review a finished sponsored video against its campaign brief and get a timestamped, evidence-backed readiness report before delivery.

## Inspiration

The edit is locked, the upload is scheduled, and then the final questions begin. Was the sponsorship disclosed clearly? Did the creator use the approved claim? Was the promo code shown correctly? Did captions cover a required logo?

Answering those questions often means scrubbing through the video while cross-referencing a dense campaign brief. It is repetitive work at the exact point when a missed detail is most expensive to fix. A single oversight can lead to another review cycle, another export, or a delayed post.

We built BrandPreflight to automate that last manual comparison. It gives creators and editors a practical preflight before a sponsored video leaves their hands, so they can spend less time checking boxes and more time making content.

## What it does

BrandPreflight reviews a completed sponsored video against its campaign brief and turns the result into a clear action list.

A creator starts on the BrandPreflight website, selects their coding agent, and copies one setup prompt. The agent installs the local skill and CLI, completes the setup, and is ready to review. The creator then provides only two files: the campaign brief and the finished video.

The agent extracts the campaign requirements and uses its video-review capability to inspect captions, transcript segments, and timestamped frames. It looks for the details that matter in sponsored content, including disclosures, approved claims, prohibited claims, branding, calls to action, promo codes, and exact wording.

The agent proposes evidence, but it does not decide the final result. BrandPreflight accepts only findings with known requirement IDs, allowed evidence sources, bounded timestamps, and valid statuses. When the review uses its prepared-media pipeline, it also checks transcript evidence and visual timestamps against signed local artifact data. Unsupported findings are discarded. Missing transcript or visual coverage is recorded as a limitation, never treated as a pass.

BrandPreflight then calculates a deterministic 0 to 100 Campaign Readiness Score, assigns a verdict, recommends the smallest useful edits, and saves a signed local report. Each result shows what passed, what needs attention, where the evidence appears in the video, and how confident the review can be.

## How we built it

We built the working implementation during the hackathon window, starting with executable tests for the scoring and evidence contracts. BrandPreflight is written in TypeScript as a local-first CLI and MCP server, with a Vite and React setup site that gives creators a copyable prompt for Codex, Claude Code, Cursor, or another coding agent. The CLI and MCP server share the same validation, scoring, and reporting modules, so the result does not change with the interface used to run the review.

The workflow separates observation from authority. A coding agent is good at reading a brief and locating relevant moments in a video. BrandPreflight is responsible for validating those observations and calculating the result. Its strict schemas reject malformed evidence, unknown requirements, incompatible evidence sources, and out-of-range timestamps. Prepared-media reviews also reject transcript excerpts that do not appear in the cited segment.

The scoring model is transparent and repeatable. Required items receive more weight than normal items. Missing required disclosures or prohibited-claim violations block a ready verdict, while incomplete media processing caps the score and makes the review inconclusive. The same validated input always produces the same score.

Because briefs and media are untrusted input, local processing has explicit boundaries. In the prepared-media path, PDF and media jobs run in constrained containers with networking disabled, limited resources, and restricted filesystem access. Review artifacts are bound to the full campaign, and the final report is signed before it is saved. The creator can open that report in a local browser without uploading the raw video to a BrandPreflight service.

## Challenges we ran into

The hardest problem was making AI useful without making it the authority. A model can notice a disclosure or describe a logo, but a plausible observation is not the same as verified evidence. We had to create a contract that lets the agent contribute what it is good at while preventing it from inventing requirements, timestamps, or a favorable score.

Media review also creates difficult trust boundaries. Campaign PDFs, transcripts, captions, filenames, and even text visible inside a frame can contain untrusted instructions. We treated all of that material as data, isolated native media processing, restricted file access, validated every model-produced field, and required evidence to remain bound to the reviewed campaign and video.

The final challenge was uncertainty. It is tempting for an automated checker to interpret missing evidence as success. BrandPreflight does the opposite. If transcription fails, visual coverage is incomplete, or a requirement cannot be supported, the report says so and prevents a misleading ready verdict.

## Accomplishments that we're proud of

We are proud that BrandPreflight is a working end-to-end tool rather than a mockup. A creator can start with one prompt, provide a real brief and video, receive a scored review, and open a local report that points to the next edit.

We are also proud of the boundary between AI judgment and deterministic verification. The model never supplies the score. Every accepted finding is connected to a campaign requirement and a cited time range, and every report leaves an auditable record of what passed, what failed, and what could not be verified.

The project is backed by unit, integration, and end-to-end tests across scoring, media boundaries, MCP tools, the CLI workflow, and the report viewer. Our final verification ran 88 tests successfully and measured 96.69 percent line coverage and 80.78 percent branch coverage.

Most of all, we turned an overlooked piece of creator busywork into a repeatable workflow. BrandPreflight does not promise perfect compliance or replace human approval. It gives creators and editors better evidence before they submit a cut, when there is still time to fix it.

## What we learned

A score alone does not create confidence. People trust a review when they can trace each result back to the brief, inspect the supporting timestamp, understand the limitations, and see the exact change that would improve the outcome.

We also learned that honest uncertainty is a product feature. An inconclusive result can be more useful than an optimistic one because it tells the creator exactly what still needs a human check.

Finally, automation only helps if it is easy to start. The copyable setup prompt became an important part of the product because it hides the local installation details and lets the creator focus on the brief, the video, and the result.

## What's next for BrandPreflight

Next, we want to expand visual verification with OCR for on-screen disclosures, promo codes, and approved text, along with broader checks for logo placement and duration. We also plan to add background processing for longer videos and more focused re-checks after a creator makes an edit.

After that, we want to test the workflow with more creators, editors, and brand teams so we can improve requirement extraction and report recommendations using real review patterns. The goal is to cover more of the sponsored-content workflow without giving up the local-first, evidence-driven foundation that makes the result trustworthy.
