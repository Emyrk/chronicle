# Leaderboard v2 phased implementation plan

The current delivery is exactly four PRs: specification PR 1622, schema-only PR
1624, subset/override resolution, and reviewed initial seeds. Later rating work
is a backlog, not additional PRs in this delivery. Each implementation PR must
be independently reviewable, buildable, and deployable, using
red-green-refactor.

## Cross-phase rules

- Treat [`spec.tex`](spec.tex) and [`behavior.md`](behavior.md) as the contract.
- Prior ratings are removed. Merged PR 1625 preserves parse scoring. Retired
  rating tables are not deployment seed inputs or a rollback target.
- Shared global configuration does not share tenant data. Boss/clear benchmark
  cohorts remain tenant scoped. Realm qualifies player and guild subject
  identity.
- Realm/season isolation is only a deferred career/cross-instance portfolio
  concern. Do not block observation, benchmark, subject, or queue implementation
  on season policy or add season columns to those current contracts.
- No career/portfolio schema, seeds, or read aggregation now.
- DPS and HPS may produce separate observations today. Mutually exclusive damage
  versus healing eligibility per player/boss is future observation policy.
- Layered provenance/invalidation needs review; Renown temporal scope remains a
  separate open decision, not a gate on boss/clear implementation.
- Keep parser mechanics in Go. The database is the intended leaderboard
  configuration source. Existing UI behavior stays unchanged until later
  cutover.
- Use sqlc queries and bounded set-based PostgreSQL rating derivation. Go
  orchestrates rather than calculates ratings.
- Migrations must not scan or rewrite historical production data during startup.
  Review production-scale impact before data migrations. Test first and measure
  representative SQL with `EXPLAIN (ANALYZE, BUFFERS, WAL)` safely before
  cutover.

## Roadmap 1: amend specification (existing PR 1622)

Replace superseded exact-full-set ruleset, career, and legacy rollback
assumptions consistently. Preserve tenant-scoped boss/clear cohorts and separate
the four configuration PRs from later rating work.

Validation: compile LaTeX, validate Markdown and repository links. No runtime
behavior changes.

## Roadmap 2: structural configuration catalog and vocabulary (PR 1624)

Red: test structural identities, uniqueness, explicit membership ordering, and
flavor classification. No observation or result schema in this PR.

Green:

- Explicitly classify relevant flavors in `database/flavor.go`: `vanilla`,
  `tbc`, `wrath`, `nightmare-of-ursol`, and `vanillaplus` initially. Ignore
  server tags such as `octowow`, `capybara`, and `ravencraft` for leaderboard
  matching.
- Add globally shared structural catalog for instances, instance variants
  (difficulty/raid size), flat bosses, named ordered encounter sets, and
  explicit memberships, plus the structural representation required for layered
  overrides.
- Do not add logical boss parents or boss-variant entities. Sartharion
  0D/1D/2D/3D are separate exact bosses.
- Support explicit exclusion at boss, instance, set, and member override levels;
  absence must remain distinguishable from an explicit value.
- Provide structure for boss Renown defaults and instance-variant overrides,
  including explicit zero, without seeding speculative values.

Refactor: review names and constraints without adding runtime readers, service
initialization, seed data, portfolios, or observation keys. Validate migrations
and generated bindings. This PR is structural and deployable alone.

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

Green: insert explicit, reviewed initial values from historical calibration.
Record their source and review basis with fixtures. Known values in migration
313 may be an authoring reference. Deployment must not execute or read old
migrations or retired tables. Do not invent awards or difficulty variants. Do
not seed portfolios.

Refactor: review the seed diff separately from schema and resolver mechanics.
Run migrations, resolver tests, and seed parity tests without changing UI reads.

## Later backlog, outside the current four PRs

### Policy reads and provenance

Test effective catalog reads, exclusions, exact boss selection, and shared
configuration with isolated tenant data. Add policy read APIs after
configuration review without switching existing UI behavior. Review layered
provenance encoding and invalidation before implementing result provenance. Do
not assume one ruleset ID/revision describes composed layers.

### Observation, fact, and dirty schema

The observation draft is not parked or blocked by season policy. Review it
against the restored tenant-scoped cohort contract. Player boss benchmarks use
tenant, boss, class, specialization, sub-specialization, and metric. Guild boss
and clear benchmarks use tenant and boss or clear. Subject keys add the
realm-qualified player or guild; dirty keys mirror the corresponding refreshed
value.

Test canonical representatives, tenant ownership, source deletion, subject
identity, DPS/HPS separation, deduplication, dirty coalescing, and revision-safe
acknowledgement. Do not implement damage/healing mutual exclusion now. Renown
scope needs a separate decision, without blocking boss/clear work. Upload-driven
dirty runs use a sliding 30-minute debounce; repair and downstream work are due
immediately.

### Projection refresh and player ratings

Test canonical projection, retraction, deletion, old/new key union,
specialization and guild movement, idempotence, and racing revisions. Implement
bounded run refresh with set-based replacement and downstream fan-out. Test
maximum benchmarks, record removal, empty cohorts, Mastery bands, zero
benchmarks, subject deletion, and concurrency. Prove tenant isolation without
treating realm as a benchmark partition. Measure plans and demonstrate a player
vertical slice before guild work.

### Guild ratings and Renown

Test positive duration normalization, Mastery, deletion, tenant isolation, and
concurrency for guild boss and clear results. Implement bounded refresh
functions. After its separate scope decision, test Renown metric deduplication,
boss defaults, explicit zero and variant overrides, exclusions, award changes,
and retraction. Verify that Renown does not depend on metric value, Mastery, or
set membership.

### Serving and scheduling

Test current-benchmark Peak, Mastery, exact named encounter sets, arbitrary
eligible boss groups, missing-evidence zero fill, exclusions from denominators,
and deterministic cursor fingerprints. Apply realm/search filters before
aggregation and ordering, without changing tenant-scoped benchmark definitions.
No career/cross-instance portfolio aggregation. Measure before adding
projections.

Test bounded draining, retries, debounce, tenant fairness, and resumable
historical discovery with a fixed source cutoff. Persist progress; observe queue
depth, oldest work, throughput, WAL, and failures. Tune from measured
transaction time and locks.

### UI cutover and operational verification

Add API/frontend and known-history parity fixtures. Cut over only after complete
historical discovery and drain, hand-calculated parity, measured plans, and
observability. Expose freshness without blocking on dirty work. Review and
exercise a disable/revert strategy, not rollback to removed ratings. Preserve
parse scoring.

## Mapping from the old 11-PR roadmap

| Old phase | Revised placement |
| --- | --- |
| 1 specification | Current PR 1, amend PR 1622 |
| 2 foundation/rulesets | Current PRs 2 (#1624), 3 (resolver), 4 (seeds) |
| 3 observations/dirty schema | Later backlog, no season gate |
| 4 projection refresh | Later backlog |
| 5 player ratings | Later backlog, tenant-scoped cohorts |
| 6 guild ratings | Later backlog, tenant-scoped cohorts |
| 7 Renown | Later backlog, separate scope decision |
| 8 serving | Later backlog, no portfolios |
| 9 scheduler/bootstrap | Later backlog |
| 10 UI cutover | Later backlog |
| 11 legacy removal | Superseded; PR 1625 preserves parse scoring |
