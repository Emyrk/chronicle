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
- Source deletion, invalidation, and replacement retract evidence and dirty the
  union of old/new affected scopes. Age never exempts source evidence from
  repair.
- Dirty projection work precedes result-scope work. Both coalesce by logical
  scope and retain revision-safe acknowledgement metadata. Keep sliding
  30-minute upload debounce and immediate repair/downstream work.
- Benchmark-only changes do not fan out dirty subject statistics. Award-only
  changes do not rebuild counts. Evidence/eligibility/projection changes still
  repair directly affected scopes.
- Raw projection algorithm compatibility is separate from composed current read
  policy. Do not introduce a new architecture or provenance scheme in this PR.

### Red: schema and constraint tests

Test canonical uniqueness, exact tenant ownership, realm-qualified subjects,
difficulty and raid-size separation, metric dimension, finite nonnegative player
values, positive durations, count/statistic validity, and independent kill-fact
uniqueness. Verify dirty-scope uniqueness, revision/due metadata, and deletion
work that survives source removal. Inspect indexes for canonical replacement,
subject/cohort access, kill-count aggregation, and bounded due-work claims.

These are schema tests, not a hidden implementation of workers or serving. Test
fixtures must not depend on retired rating tables or modify deployed migrations.

### Green: schema implementation

Create the required evidence, benchmark, raw-statistic, kill-fact,
count-summary, and dirty-work structures with tenant ownership constraints and
appropriate RLS. Use the project's SQL generation workflow. Migrations must not
scan or rewrite historical production evidence during startup. Review
production-scale impact before any data migration. No backfill or runtime
cutover is authorized here.

### Refactor and validation

Review each key against the value it represents. Confirm difficulty and raid
size are never dropped and realm appears in subject identity without
partitioning benchmarks. Confirm no normalized Mastery/band values or frozen
Renown points are stored. Run migration/constraint tests and generation checks.
Validate the LaTeX and Markdown contract with the schema diff.

## Later PR: projection and result-scope maintenance

Implement bounded set-based PostgreSQL refresh with Go orchestration. Parser
mechanics stay in Go. Preserve old/new scopes before replacing canonical
evidence and retract both observations and independent kill facts. Refresh
directly changed benchmarks, subject statistics, and kill counts. Do not enqueue
a whole cohort of subjects merely because its benchmark changed.

Add numerical equivalence tests for raw player and reciprocal-duration bands,
including nonuniform durations, empty bands, ties, zero player benchmark, and
small-sample ceilings. Test canonical duplicates, source retraction, movement,
retries, coalescing, revision races, upload debounce, and immediate repair.

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
