# Leaderboard v2 implementation plan

## Completed configuration foundation

- PR 1622: specification.
- PR 1624: structural configuration catalog and flavor vocabulary.
- PR 1633: subset/override resolution.
- PR 1634: initial configuration seeds.
- PR 1636: configuration inspector.
- Migration 343: Wrath configuration.

Prior ratings are removed; PR 1625 preserves parse scoring. Do not promise
legacy rating rollback or use retired tables as deployment seed inputs.
Configuration semantics remain in [`spec.tex`](spec.tex) and
[`behavior.md`](behavior.md).

## Next PR: all-time evidence and raw-statistics schema only

This PR adds tables, constraints, indexes, and schema tests. Physical names are
chosen by the schema implementation; this plan does not prescribe guessed names.
No workers, refresh functions, serving queries, historical backfill, scheduler
wiring, or UI cutover belong in this PR.

### Approved storage semantics

- Canonical deduplicated evidence preserves raw DPS, HPS, and guild durations.
  DPS/HPS remain separately permitted; mutual exclusion is future policy.
- All scopes are all-time. No rolling180day or season dimensions, expiry, or
  finalized-season retention. Career/cross-instance portfolios remain deferred.
- Benchmarks are tenant scoped. Realm qualifies player/guild subjects, not
  benchmark cohorts. Both difficulty and raid size separate cohorts and
  subjects.
- Shared benchmarks retain maximum player metrics or minimum positive guild
  durations. Subject rows store count and raw Peak/Form/Floor sufficient
  statistics, never normalized scores.
- Players use raw metric band means. Guilds use arithmetic means of reciprocal
  durations, not reciprocals of mean duration. Preserve existing band
  boundaries, empty-band zero, and Mastery weights exactly.
- Independent metric-free canonical kill facts prevent DPS/HPS double credit.
  Renown summaries count kills per subject and exact boss plus instance variant.
  Current points are count times current effective award, not frozen points.
- Source data -> canonical evidence -> summaries. Normal ingestion/actions write
  evidence and enqueue D2 for old/new affected scopes atomically; D1 is not a
  mandatory upload path.
- D1 is rare coarse canonical-run repair for historical data, corrections, and
  deletion; less efficient repair is acceptable. Source deletion enqueues D1 and
  leaves evidence intact. D1 reconstructs authoritative evidence, enqueues D2
  for the old/new scope union before replacing/removing evidence, and commits
  both changes atomically.
- D2 is normal frequent exact-scope benchmark, raw-statistic, and kill-count
  work. D1 and D2 coalesce with revision-safe acknowledgement. No mandatory
  per-upload 30-minute D1 debounce or new fixed scheduling delay is specified.
- No integrity triggers. Local constraints are structural only; writers and
  reconcilers enforce tenant/source/canonical correctness. No source cascades
  into evidence or evidence FKs that block source deletion.
- Benchmark-only changes do not fan out dirty subject statistics. Award-only
  changes do not rebuild counts. Evidence/eligibility/projection changes still
  repair directly affected scopes.
- Raw projection algorithm compatibility is separate from composed current read
  policy. Do not introduce a new architecture or provenance scheme in this PR.

### Red: schema and constraint tests

Test structural uniqueness, tenant dimensions, realm-qualified subjects,
difficulty and raid-size separation, metric dimension, finite nonnegative player
values, positive durations, count/statistic validity, and independent kill-fact
uniqueness. Verify dirty-scope uniqueness, revision/due metadata, and deletion
work and evidence that survive source removal. Verify no integrity triggers or
source-deletion cascades/blocking evidence FKs. Cross-relation tenant/source and
canonical correctness will be tested with writers/reconcilers later. Inspect
indexes for canonical replacement, subject/cohort access, kill-count
aggregation, and bounded due-work claims.

These are schema tests, not a hidden implementation of workers or serving. Test
fixtures must not depend on retired rating tables or modify deployed migrations.

### Green: schema implementation

Create the required evidence, benchmark, raw-statistic, kill-fact,
count-summary, D1 repair, and D2 exact-scope work structures with local
structural constraints and appropriate tenant RLS. Do not use integrity triggers
or source FKs to enforce writer/reconciler responsibilities. Use the project's
SQL generation workflow. Migrations must not scan or rewrite historical
production evidence during startup. Review production-scale impact before any
data migration. No backfill or runtime cutover is authorized here.

### Refactor and validation

Review each key against the value it represents. Confirm difficulty and raid
size are never dropped and realm appears in subject identity without
partitioning benchmarks. Confirm no normalized Mastery/band values or frozen
Renown points are stored. Run migration/constraint tests and generation checks.
Validate the LaTeX and Markdown contract with the schema diff.

## Later PR: direct evidence writes, D1 repair, and D2 maintenance

Implement canonical evidence writes in normal ingestion/actions with atomic D2
enqueue for old/new scope unions. Keep parser mechanics in Go. Test writer
checks for tenant/source agreement, visibility, and canonical identity without
triggers.

Implement rare coarse D1 repair separately. Source deletion must enqueue D1 and
leave evidence intact, without a cascade or blocking FK. D1 captures old keys,
reconstructs evidence from authoritative remaining sources, enqueues D2 for the
old/new union before replacement/removal, and commits both atomically. Test
empty replacement after deletion/invalidation and failures at transaction
boundaries. No source correction may lose its summary repair obligation.

Implement frequent exact-scope D2 refresh from evidence for benchmarks, raw
subject statistics, and kill counts. Never dirty an entire subject cohort merely
because its benchmark changed. Test coalescing, revision races, retries, and
normal direct writes that do not enter D1 or wait for a mandatory D1 upload
debounce. Worker scheduling and any optional repair pacing are later decisions,
not a new schema-imposed delay requirement.

Retain numerical equivalence tests for raw player and reciprocal-duration bands,
including nonuniform durations, empty bands, ties, zero player benchmark, and
small-sample ceilings. Test canonical duplicates, source retraction, and
movement.

## Later PRs: serving, bootstrap, and cutover

Read current normalized Peak/Form/Floor/Mastery from sufficient statistics and a
shared current benchmark. Read Renown from kill counts and current effective
awards. Test benchmark and award changes without rewriting unaffected summaries.
Exact equivalence to the original bands applies to coherent evidence/benchmark
states; transient display clamps do not redefine the mathematical contract.

Retain exact configured encounter sets, zero-fill missing included bosses,
remove excluded bosses from denominators, and apply realm/search filters without
changing tenant benchmark cohorts. Keep ordered cursors and current UI unchanged
until explicit cutover. No portfolio or season aggregation is approved.

Add resumable historical discovery/backfill separately from startup migrations.
Measure query plans, transaction duration, WAL, and lock waits before
deployment. Require complete bootstrap, parity fixtures, observability, and a
reviewed feature disable/revert strategy before UI cutover. Preserve parse
scoring.
