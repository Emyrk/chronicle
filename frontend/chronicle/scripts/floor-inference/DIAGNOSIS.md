# Gnomeregan calibration diagnosis

Runtime integration is implemented behind validated artifact metadata or an explicit
development preview. No production artifact has been published or activated. An independent log has coverage-only evaluation, but no held-out
floor labels have been supplied. The six anchors are calibration checks, not an accuracy estimate.

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
The initial experimental engine did not account for that provenance. The revised
engine ignores synthetic snapshots as inference evidence; raw telemetry remains
unchanged. This is not evidence that floor geometry is wrong.

## Bidirectional feasibility

Later unambiguous floor-2 observations arrive within about three seconds, so an
offline lookahead could resolve the `[1,2]` and `[2,3]` samples. It cannot safely
turn singleton `[1]` or `[3]` into floor 2 using geometry alone. First distinguish
fresh measurements from synthetic cached snapshots, then evaluate bounded
bidirectional inference within continuous segments. Do not propagate across
unobserved gaps or overwrite explicit floor telemetry. Live causal mode cannot
use future evidence and must preserve unknown outcomes.

## Implemented correction and calibration result

The revised engine ignores synthetic cached snapshots, uses a fresh singleton
anchor only when all recent party samples support that floor, and fills unknown
replay estimates with up to five seconds of future evidence. It never overwrites
known estimates, crosses encounter boundaries, or spans observation gaps over two
seconds. The five-second cap is a generic bounded replay horizon, not derived
from any annotation offset. Causal mode omits lookahead.

All six starts now match: 0.000, 793.266 and 2238.536 seconds use lookahead;
2543.776, 2687.758 and 3709.852 seconds use fresh geometry. The regression suite
covers synthetic provenance, explicit telemetry, contradictory party evidence,
gaps and seeking. No per-log offsets enter the engine.

Texture-free indexed float32/uint32 artifact: 7,578,679 bytes JSON,
2,240,951 bytes gzip, versus 14,776,332 bytes across source GLBs. Candidate sets
match the GLB raycasts for all 9,039 party samples (zero mismatches). The artifact
retains exact float32 positions and indexed triangles; no lossy grid rasterization.
The runtime uses a spatial index of triangle references for lookup.

This remains one labeled calibration run, not held-out floor-accuracy evidence. The generated descriptor
is `validated:false`; production/default activation remains gated. Local development
can exercise the actual replay integration using `?floorInferencePreview=1` with
local manifest/artifact routes. No production mutation was performed.

## Independent log, coverage-only check

The public recent-log API supplied a second Gnomeregan instance,
`LUN-dKiU6KV-vpcD`, with a different log group and the same dataset/world frame.
It has 54 encounters and unit-position capability. Exact support projection gives
8,150 party samples, zero uncovered, 2,104 ambiguous and zero compact-artifact
candidate mismatches. No operator floor labels were supplied for this run, so
validation exits 2 rather than treating an empty label set as a pass.
`gnomeregan-heldout-coverage.json` records this limited independent evidence.
Held-out floor correctness and production activation remain blocked on labels.
