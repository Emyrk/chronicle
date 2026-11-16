# Experiment outcome

**Stopped as a merge candidate.** Rejection of this stack is not rejection of
headless compute or every refactor discovered during it.

## Goal and result

- Goal: reduce hosted compute cost by using home hardware; eventually support live
  logging and battleground workloads.
- Built: explicit parser dependencies, complete-file sessions, graph snapshots,
  a headless worker, durable handoff, and primary-only finalization/publication.
- Cost: the native production path depended on serializing the full live graph.
  A missing retained message codec could stop an otherwise parseable log.
- Scope grew into queues, compatibility, storage, leases, catalogues, and UI cache
  behavior before the original cost benefit was demonstrated end to end.

## What the evidence says

- Complete-file continuation and independent-process restore had strong targeted
  tests. Worker-to-publication tests used PostgreSQL and local object storage.
- One large snapshot was 190.80 MB versus 138.08 MB of raw input; gzip level 6 was
  about 23.46 MB versus 11.84 MB. This was not a minimal continuation-state format.
- A real BWL comparison supported a narrow parity claim, not universal parser
  equivalence. Its consume catalogue comparison was stronger than its other
  output comparison; see the detailed evidence.
- Successful snapshots were non-terminal: the live parser remained usable.
  Logical EOF did not mean `Finalize`, and restore required only future inputs.
- Arbitrary uploaded parts still replayed the whole captured logical prefix.
  Production live incremental parsing was **not** delivered.

## Why stop

`SpellStart` exposed missing retained-type coverage after earlier fixes for other
messages. The later audit added four explicit codecs and inventoried 184 sites,
but still found routes retaining arbitrary current messages. Tests passing did
not resolve that open-ended compatibility burden.

Completed finalizer jobs with apparently missing instances also exposed output
visibility problems. Local investigation found the instances existed; it did not
establish lost publication. A separate swallowed-finalization-error bug was found.

The final local fixes were evidence-gathering work, not a renewed recommendation
to merge. No live two-daemon/S3 acceptance test or measured hosted-cost reduction
was established.

[Detailed evidence, source timeline, and reproduction limits](reference/experiment-evidence.md)
