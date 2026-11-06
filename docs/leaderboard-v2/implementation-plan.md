# Leaderboard v2 phased implementation plan

This plan is the guide for the Graphite stack. Each PR must be independently
reviewable, buildable, and deployable. Use red-green-refactor within each phase.
Do not move rating math into Go to make a phase easier.

## Cross-phase rules

- Treat [`spec.tex`](spec.tex) and [`behavior.md`](behavior.md) as the contract.
- Create new schema alongside the legacy subsystem until serving cutover is
  verified. Remove legacy code and tables only in the final cleanup phase.
- Migrations create schema and bounded functions. They do not scan or rewrite
  historical production data during startup.
- All database queries go through sqlc.
- Every rating table is explicitly tenant scoped and uses forced RLS where
  appropriate.
- PostgreSQL functions process bounded pages. They use set-based SQL rather than
  per-dirty-row loops.
- Add database integration tests before each function implementation.
- Measure representative statements with `EXPLAIN (ANALYZE, BUFFERS, WAL)` in a
  safe staging or test environment before production cutover.

## PR 1: specification and stack guide

Deliverables:

- Add the authoritative LaTeX model.
- Add this behavior contract and phased plan.
- Mark older rating implementation documents as historical where needed.

Validation:

- Compile the LaTeX document.
- Check Markdown formatting and repository links.

No runtime behavior changes.

## PR 2: foundation schema and rulesets

Red:

- Add migration tests for tenant ownership, flavor-set canonicalization, one
  ruleset per flavor set, eligible bosses, Renown awards, and portfolio
  constraints.

Green:

- Add flavor sets, members, global rulesets, eligible bosses, Renown awards, and
  portfolios.
- Add the single resolver contract for dataset flavor union tenant flavors.
- Add tenant-aware RLS and supporting source constraints.
- Create `internal/services/serviceratings/` with initialization only.

Refactor:

- Review naming and shared database types. Do not generalize unrelated player
  and guild behavior prematurely.

## PR 3: observation, fact, and dirty schema

Red:

- Test stable observation identities, canonical representative enforcement,
  tenant isolation, source deletion, dirty-key coalescing, debounce timestamps,
  and revision increments.

Green:

- Add player, guild boss, and guild clear observation tables.
- Add player and guild Renown fact tables.
- Add dirty run, benchmark, subject, Renown, and persisted tenant tables with
  due-work indexes.
- Define `process_after <= now()` as due. Apply the sliding 30-minute debounce
  only to upload-driven dirty runs; make repair and all downstream or
  configuration work due immediately.
- Add enqueue queries only. Do not calculate ratings yet.

Refactor:

- Verify every queue key exactly mirrors the value it refreshes.

## PR 4: dirty-run projection refresh

Red:

- Test visible canonical projection, retraction, deletion without a source FK,
  old/new key union, specialization movement, guild movement, idempotence, and
  revision-safe acknowledgement.

Green:

- Implement `leaderboard_refresh_dirty_runs` as a bounded PostgreSQL function.
- Replace observations and Renown facts for a claimed run page.
- Fan out benchmark, subject, and Renown dirty keys using set-based SQL.
- Return operational counters through sqlc.

Refactor:

- Inspect query plans and remove any per-run statement loop.

## PR 5: player boss benchmarks and subjects

Red:

- Test maximum benchmark calculation, unchanged benchmark behavior, cohort
  fan-out, record removal, empty cohorts, Mastery bands, zero benchmark
  handling, subject deletion, concurrent claims, and racing revisions.

Green:

- Add player benchmark and result tables.
- Implement `leaderboard_refresh_player_boss_benchmarks`.
- Implement `leaderboard_refresh_player_boss_subjects` using SQL window
  functions.

Refactor:

- Measure fan-out and subject refresh plans with representative cohort sizes.

This is the first end-to-end vertical slice and must be demonstrable before
guild work.

## PR 6: guild boss and clear ratings

Red:

- Repeat the benchmark, duration normalization, Mastery, deletion, and
  concurrency cases for boss kills and clears. Verify lower duration is better.

Green:

- Add guild benchmark and result tables.
- Implement guild boss and clear benchmark refresh functions.
- Implement guild boss and clear subject refresh functions.

Refactor:

- Share SQL structure only where it remains clearer than parallel explicit
  functions.

## PR 7: Renown

Red:

- Test metric deduplication, configured awards, award changes, source
  retraction, zero facts, player/guild isolation, and racing dirty revisions.

Green:

- Add player and guild Renown result tables.
- Implement bounded player and guild Renown refresh functions.
- Implement tenant-level fan-out for ruleset award changes.

Refactor:

- Verify Renown queries never join metric or Mastery state.

## PR 8: read service and cursor queries

Red:

- Test boss Peak derivation, current-benchmark reads, boss Mastery, arbitrary
  boss-group aggregation, zero-filled missing bosses, portfolio weights,
  pre-order realm/search filters, deterministic cursors, query-fingerprint
  rejection, and mixed ruleset revisions.

Green:

- Add sqlc serving queries.
- Add `serviceratings` request types, cursor encoding, and handlers.
- Support boss, configured instance, configured portfolio, and arbitrary boss
  groups.
- Order descending score with ascending realm and subject tie breakers. Encode
  that tuple plus a fingerprint of boss selection, cohort, metric, and filters
  in the cursor.
- Apply realm and search filters before aggregation and ordering. Reject cursor
  reuse for a different fingerprint; do not invalidate cursors solely for a
  ruleset revision.
- Return pages of approximately 50 without exact ranks or offset pagination.

Refactor:

- Use `EXPLAIN (ANALYZE, BUFFERS)` to decide whether any read projection is
  justified. Do not materialize aggregate results without measurements.

## PR 9: scheduling and historical bootstrap

Red:

- Test one coalesced tenant drain, bounded function invocation, retry behavior,
  debounce, tenant fairness, and resumable historical discovery.

Green:

- Add the thin scheduler in `serviceratings`.
- Invoke PostgreSQL functions until the time budget or no-work result.
- Add a resumable source scan that captures a fixed source cutoff and only
  dirties canonical runs at or before that cutoff. Concurrent mutations continue
  through the normal dirty-run path.
- Persist scan progress. A tenant is not eligible for serving cutover until
  discovery reached its cutoff and all work produced by that scan drained.
- Add operational queue depth, oldest-work, throughput, and failure metrics.

Refactor:

- Tune batch sizes from measured transaction time, WAL, and lock waits.

## PR 10: frontend cutover and verification

Red:

- Add API and frontend tests for all visible leaderboard selections and cursor
  behavior.
- Add parity fixtures for known player and guild histories.

Green:

- Switch the leaderboard and profile surfaces to leaderboard v2 reads.
- Expose freshness without blocking reads on dirty work or ruleset revision.
- Keep an explicit rollback path to legacy reads during verification.

Refactor:

- Remove temporary compatibility adapters after the new API contract stabilizes.

## PR 11: legacy removal

Red:

- Add repository-level checks that no runtime routes, jobs, queries, or frontend
  calls reference legacy rating generations, windows, scans, or projections.

Green:

- Remove legacy rating Go code, SQL queries, jobs, routes, generated bindings,
  and frontend compatibility code.
- Add a new migration that drops legacy rating tables and functions. Do not edit
  old deployed migrations.
- Remove or archive obsolete operational documentation.

Refactor:

- Run full generation, backend/frontend builds, lint, and tests. Review the
  final package boundary and delete abstractions used only during transition.

## Production acceptance gate

Before enabling leaderboard v2 reads for a tenant:

1. Historical discovery reached its captured fixed cutoff. Partial historical
   coverage is not eligible for serving cutover.
2. All dirty work produced at or before that cutoff drained; ordinary newer work
   may continue converging.
3. Representative player and guild histories match hand-calculated fixtures.
4. Read and refresh query plans were measured against production-like row
   counts.
5. Queue depth, oldest work, function duration, rows refreshed, WAL, and errors
   are observable.
6. Rollback to legacy reads was exercised before legacy removal.
