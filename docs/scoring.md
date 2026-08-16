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

A missed required disclosure or a violated required prohibited-claim rule caps the total at 49 and returns `blocked`. A fully unverified review returns `inconclusive`. Otherwise, 85+ with no changes is `ready`; incomplete or failed items return `needs_changes`.

The score intentionally penalizes missing evidence. This prevents sparse transcript/frame coverage from producing a misleadingly high readiness result.

Every MCP/CLI scoring request includes the reviewed duration and timestamped transcript. Evidence is discarded when it uses a source incompatible with the requirement, extends beyond the reviewed duration, or claims a satisfied transcript excerpt that does not occur in an overlapping cited segment. Requirements needing both transcript and visual evidence remain `at_risk` until both sources are satisfied.
