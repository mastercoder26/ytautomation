# Campaign Readiness Score

The score is a weighted percentage calculated from validated requirement statuses:

```text
required = 5 points
high     = 3 points
normal   = 1 point

satisfied     = 100% of weight
at_risk       = 25% of weight
missed        = 0%
violated      = 0%
not_verifiable = 0%
```

A missed required disclosure or a violated required prohibited-claim rule caps the total at 49 and returns `blocked`. A fully unverified review returns `inconclusive`. Required processing that is partial, failed, or skipped caps the score at 84 and prevents `ready`; an otherwise-satisfied review is `inconclusive`. Otherwise, 85+ with no changes is `ready`; missed or at-risk items return `needs_changes`.

The score intentionally penalizes missing evidence. This prevents sparse transcript/frame coverage from producing a misleadingly high readiness result.

MCP scoring binds evidence to the signed manifest for a prepared `artifactId`; duration, transcript, and processing status are never supplied by the receiving model. Evidence is discarded when it uses a source incompatible with the requirement, extends beyond the reviewed duration, or claims a satisfied transcript excerpt that does not occur in an overlapping cited segment. Requirements needing both transcript and visual evidence remain `at_risk` until both sources are satisfied.
