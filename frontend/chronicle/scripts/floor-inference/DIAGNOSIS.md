# Gnomeregan calibration diagnosis

This is offline groundwork, not an activated Replay Map feature. No held-out log
has been evaluated. The six anchors are calibration checks, not an accuracy estimate.

The public stream contains 14,016 all-unit samples. The validator selects 9,039
party samples; 2,109 of those have multiple projected floor candidates and zero
have no support. Earlier all-unit overlap counts are not this denominator.

## Two incorrect encounter starts

| Verified offset | Expected | Start estimate | Gap since previous party observation | First geometric floor 2 estimate |
|---|---|---|---|---|
| 793.266 seconds | 2 | 1 | 11.966 seconds | start + 2.773 seconds |
| 3709.852 seconds | 2 | 3 | 13.630 seconds | start + 2.602 seconds |

At 793.266s, five start samples support `[1,2]`, `[1]`, `[1]`, `[2]`, `[1]`.
All five are marked synthetic in protobuf EventMeta field 4. At 3709.852s,
six samples support `[2,3]`, `[3]`, `[2,3]`, `[3]`, `[3]`, `[2]`.
The first five are synthetic; the last `[2]` sample is real. There are five
unique units at the latter timestamp; conflicting same-time observations are
combined conservatively rather than given duplicate votes.

These are not initially sticky-history errors: both estimates have source
`geometry`, and both preceding gaps exceed the two-second party evidence window.
The engine then retains the incorrect geometric anchor briefly via continuity.

There is a concrete upstream explanation to investigate before changing mesh
membership: `combatlog/parser/common/instances/unittelemetryemitter.go:139-143`
re-emits cached positions at encounter start using the trigger timestamp and
`messages.WithSynthetic()`. Thus the timestamp is not necessarily the time that
position was observed. The diagnostic export now retains the synthetic bit.
The current experimental engine does not account for that provenance, so this
is an explicit activation blocker, not evidence that floor geometry is wrong.

## Bidirectional feasibility

Later unambiguous floor-2 observations arrive within about three seconds, so an
offline lookahead could resolve the `[1,2]` and `[2,3]` samples. It cannot safely
turn singleton `[1]` or `[3]` into floor 2 using geometry alone. First distinguish
fresh measurements from synthetic cached snapshots, then evaluate bounded
bidirectional inference within continuous segments. Do not propagate across
unobserved gaps or overwrite explicit floor telemetry. Live causal mode cannot
use future evidence and must preserve unknown outcomes.

No timestamp-specific tuning, synthetic filtering, smoothing, or runtime wiring
was added in this bounded diagnostic pass. Before activation, test provenance-
aware inference, held-out logs and seek behavior, and agree on compact support
artifact hosting. Loading every textured GLB during replay is not implemented.
