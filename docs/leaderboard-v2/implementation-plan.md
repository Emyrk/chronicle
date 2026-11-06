# Leaderboard v2 phased implementation plan

This replaces the old 11-PR roadmap. Roadmap numbers below are sequence labels,
not fabricated GitHub PR numbers. Each PR must be independently reviewable,
buildable, and deployable. Use red-green-refactor within each implementation PR.

## Cross-phase rules and gates

- Treat [`spec.tex`](spec.tex) and [`behavior.md`](behavior.md) as the contract.
- Prior ratings are removed. Merged **PR 1625** preserves parse scoring. Retired
  rating tables are neither seed inputs nor a rollback target.
- Shared global configuration does not share tenant data. Peak/Mastery
additionally
  require realm (season) isolation. Exact season identity, lifecycle, and
temporal
  boundaries are unresolved; do not invent a season table or time windows.
- Park the existing observation-schema draft. Observation, benchmark, subject,
  and queue-key implementation is blocked until the season contract is settled.
  Renown scope and layered provenance/invalidation require separate decisions.
- No career or cross-instance portfolio schema, seeds, or read aggregation now.
- Keep parser mechanics in Go. The database is the intended source of
leaderboard
  configuration. Existing UI behavior stays unchanged until a later cutover.
- All database queries go through sqlc. Rating derivation remains set-based SQL
  in bounded PostgreSQL functions; Go orchestrates rather than calculates
ratings.
- Migrations do not scan or rewrite historical production data during startup.
  Review production-scale impact before any data migration.
- Test before implementation; measure representative SQL with
  `EXPLAIN (ANALYZE, BUFFERS, WAL)` safely before serving cutover.

## Roadmap 1: amend specification (existing PR 1622)

Replace superseded exact-full-set ruleset, career, tenant-only cohort, and
legacy
rollback assumptions consistently across all four documents. Clearly separate
approved configuration work from gated physical rating work.

Validation: compile LaTeX, validate Markdown and repository links. No runtime
behavior changes.

## Roadmap 2: structural configuration catalog and vocabulary (PR 1624)

Red: test structural identities, uniqueness, explicit membership ordering, and
flavor classification. No observation or result schema in this PR.

Green:

- Explicitly classify relevant flavors in `database/flavor.go`: `vanilla`,
`tbc`,
  `wrath`, `nightmare-of-ursol`, and `vanillaplus` initially. Ignore server tags
  such as `octowow`, `capybara`, and `ravencraft` for leaderboard matching.
- Add globally shared structural catalog for instances, instance variants
  (difficulty/raid size), flat bosses, named ordered encounter sets, and
explicit
  memberships, plus the structural representation required for layered
overrides.
- Do not add logical boss parents or boss-variant entities. Sartharion
  0D/1D/2D/3D are separate exact bosses.
- Support explicit exclusion at boss, instance, set, and member override levels;
  absence must remain distinguishable from an explicit value.
- Provide structure for boss Renown defaults and instance-variant overrides,
  including explicit zero, without seeding speculative values.

Refactor: review names and constraints without adding runtime readers, service
initialization, seed data, portfolios, or parked observation keys. Validate
migrations and generated bindings. This PR is structural and deployable alone.

## Roadmap 3: subset and override resolution (next PR, number unassigned)

Red: test normalized relevant dataset-plus-tenant union, ignored tags, subset
matching, strict-superset precedence, conflicting incomparable matches of equal
and unequal cardinality, inheritance, exclusions, explicit zero, and tenant data
separation. Include exact Sartharion selection and empty effective set behavior.

Green: add sqlc resolution queries and database integration tests. Resolve each
applicable layer by required-flavor subset, not exact full-set lookup. Reject
conflicting incomparable assignments. Disabled bosses leave effective sets,
denominators, and Renown; history is untouched. Set membership is not a Renown
award source. No automatic Vanilla award suppression for TBC/Wrath.

Refactor: keep one tested resolution contract. Do not choose a single provenance
ruleset or invent downstream repair keys. No UI switch or policy read cutover.

## Roadmap 4: reviewed initial seeds (following PR, number unassigned)

Red: add parity fixtures for approved catalog identities, exact set membership
and order, exclusions, boss awards, and variant overrides. Default Sartharion
selection is 0D, never best-variant substitution.

Green: insert explicit, reviewed initial values. Record their source and review
basis with fixtures. Do not read or extract values from migration 313 or retired
tables. Do not invent awards or difficulty variants. Do not seed portfolios.

Refactor: review the seed diff separately from schema and resolver mechanics.
Run migrations, resolver tests, and seed parity tests without changing UI reads.

## Roadmap 5: policy reads and runtime contract review (later)

Red: test effective catalog reads, exclusions, exact boss selections, and shared
configuration with isolated tenant data.

Green: introduce policy read APIs only after catalog, resolver, and seed review.
Keep existing UI behavior unchanged. Before proceeding to rating storage,
settle:

1. Realm/season identity, lifecycle, temporal boundaries, and source assignment.
2. Renown scope independently of Peak/Mastery if needed.
3. Layered provenance representation and configuration invalidation/repair.
4. Empty/missing scope behavior and tests for isolation across realms and
seasons.

Refactor: update the specification first with approved answers. No implicit
all-seasons interpretation of all-time. These are design gates, not
implementation
details to fill in while writing migrations.

## Roadmap 6: observation, fact, and dirty schema (parked draft)

**Blocked by Roadmap 5.** Replace the old tenant-only keys with reviewed scoped
identities before reviving the draft. Test canonical representatives, source
ownership/deletion, realm and season isolation, deduplication, dirty coalescing,
and revision-safe acknowledgement. Renown fact/result/work keys require its own
scope agreement. Do not implement career portfolios.

Once approved, add schema and enqueue queries only. Upload-driven dirty runs
use a sliding 30-minute debounce; repair and downstream work are due
immediately.
Refactor by proving each queue key exactly mirrors the scoped value refreshed.

## Roadmap 7: dirty-run projection refresh

After the schema gate, test visible canonical projection, retraction, deletion,
old/new key union, specialization and guild movement, idempotence, and racing
revisions. Implement bounded `leaderboard_refresh_dirty_runs` with set-based
replacement and downstream fan-out. Inspect plans and remove per-run SQL loops.

## Roadmap 8: player boss benchmarks and subjects

Test maximum benchmarks, unchanged benchmarks, record removal, empty cohorts,
Mastery bands, zero benchmarks, subject deletion, scoped fan-out, and
concurrency.
Implement bounded benchmark and subject refresh functions with SQL windows.
Measure representative plans. This is the first end-to-end rating slice before
guild work; prove no cross-realm or cross-season benchmark contamination.

## Roadmap 9: guild boss and clear ratings

Repeat duration normalization, deletion, Mastery, isolation, and concurrency
cases for boss kills and clears. Lower positive duration is better. Implement
bounded guild benchmark and subject refresh functions. Share SQL only where it
is clearer than explicit parallel functions.

## Roadmap 10: Renown

After its scope gate, test metric deduplication, boss defaults, explicit zero
and
variant overrides, exclusion, award changes, source retraction, empty facts, and
player/guild isolation. Implement bounded refresh and reviewed layered-change
fan-out. Verify Renown never depends on metric value, Mastery, or set
membership.

## Roadmap 11: read service and cursor queries

Test boss Peak derivation, current benchmarks, Mastery, exact named encounter
sets, arbitrary eligible boss groups, missing-evidence zero fill, exclusion from
denominators, deterministic cursors, and scope/filter fingerprint rejection.
Implement sqlc reads and `serviceratings` orchestration. No
career/cross-instance
portfolio aggregation. Apply realm/season scope and search before aggregation
and ordering. Return approximately 50 rows, not exact ranks or offset pages.
Measure before adding aggregate projections. Layered provenance behavior must
follow the reviewed contract, not an assumed single ruleset revision.

## Roadmap 12: scheduling and historical bootstrap

Test bounded draining, retry, debounce, tenant fairness, and resumable discovery
within the agreed scopes. Implement thin scheduling and a resumable scan with a
fixed source cutoff. Normal mutations continue through dirty-run work. Persist
progress and observe queue depth, oldest work, throughput, WAL, and failures.
Tune from measured transaction time and lock waits.

## Roadmap 13: UI cutover and operational verification

Add API/frontend tests for supported selections and cursor behavior, plus known
player/guild history fixtures. Switch leaderboard/profile reads only after
complete historical discovery and drain, hand-calculated parity, measured plans,
and observability. Expose freshness without blocking on dirty work.

Review and exercise a disable/revert strategy for the new feature. Do not
promise
rollback to removed legacy ratings. Parse scoring must remain intact. Remove
only temporary adapters or obsolete references still present; do not plan a
second removal of already removed ratings.

## Mapping from the old 11-PR roadmap

| Old phase | Revised roadmap |
| --- | --- |
| 1 specification | 1, amend PR 1622 |
| 2 foundation | 2 PR 1624; 3 resolver; 4 seeds; 5 reads/gates |
| 3 observations/dirty schema | 6, parked until season contract |
| 4 projection refresh | 7 |
| 5 player ratings | 8 |
| 6 guild ratings | 9 |
| 7 Renown | 10, separately scope-gated |
| 8 serving | 11, no portfolios |
| 9 scheduler/bootstrap | 12 |
| 10 UI cutover | 13 |
| 11 legacy removal | Superseded; PR 1625 preserves parse scoring |
