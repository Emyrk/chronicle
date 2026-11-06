# Read-only leaderboard v2 preview

`/leaderboard-v2` uses the existing Hub layout, rating cards, filters and tables.
The alternate plural frontend page has been removed; `/leaderboards/*` is unchanged.
The Hub rating adapter uses the browser API
`GET /api/v1/leaderboards-v2`, under existing optional-auth and request-tenant
middleware. Root requests cannot infer a tenant or select arbitrary evidence.
Use an actual tenant host. Configuration remains available through the inspector.

## Scope

- Player exact-boss and named-set Peak and Mastery, for one exact class, spec,
  subspec, DPS/HPS cohort and instance difficulty/size.
- Guild exact-boss and named-set Peak/Mastery, plus instance clear Peak/Mastery.
- Player and guild Renown from metric-independent counts and current resolved
  awards. Renown includes all enabled instance bosses, **independent of named
  sets**, but only in the selected difficulty/size. Class/spec/metric filters are
  rejected, not ignored.
- Vanilla without configured variant tuples uses exact difficulty `''` and size
  `0`; the UI does not invent a Heroic/variant selector.
- All-time only. No portfolios, observation replay, population functions,
  benchmark refresh, D1/D2 workers, backfill, or parser changes.

`internal/leaderboardconfig.Resolve` is the only effective-config authority.
Conflicts fail closed. Disabled instances, variants, bosses, and sets cannot be
selected. Missing selected bosses contribute zero through a fixed denominator;
excluded bosses leave that denominator. An enabled empty set returns
`status: "empty_selection"` with no rows, never division by zero.

Player bands scale from raw summaries at read time. Guild bands use stored mean
reciprocals, not reciprocals of mean durations. Shared benchmarks do not partition
by realm. Current Renown awards are supplied as paired exact-boss/award arrays to
the SQL read, so award-only changes do not require recounting facts.

## Existing Hub mapping

The existing singular Hub is retained: instance grid/banner, sidebar, class/spec
filters, rating cards, player/guild tables and unrelated parsing/speedrun tabs.
The plural browser page was removed rather than maintained as a second design.
The HTTP endpoint remains plural as an internal API contract.

Ratings are labeled all-time instead of offering an unsupported 180-day window.
Player performance requires one exact cohort using the existing class/spec
filters; an ambiguous selection gets an explicit prompt, never a silent merge
or arbitrary default. One boss maps directly; arbitrary multi-boss selections are sent as repeated
`bosses` parameters. The API validates every member against current enabled
bosses, deduplicates and sorts the selection, and preserves its exact denominator.
Renown ignores class/set filters and uses the selected instance variant, with a
visible notice. Per-boss cards request genuine boss-specific Renown from counts and current
awards, while center Renown totals remain independent of the performance selection. No retired catch-up worker status is implied.

Existing full-list controls use cursor history. Search starts a new cursor chain;
no synthetic total or global rank is displayed. Missing throughput, run dates,
or raw Mastery bands stay absent rather than manufactured from normalized scores.

## Repair metadata

`projection_version` and `algorithm_version` are operational repair metadata,
not read eligibility. Reads ignore both fields, including when a benchmark and
subject carry different values. Rare changes are repaired in place; mixed old
and new summaries may be visible temporarily. There is no version snapshot or
old-leaderboard serving path. Projection rules describe source-to-canonical
eligible evidence transformations, deduplication, and player cohort
classification. Award-only configuration changes do not require evidence
rewrites or recounts.

## API parameters

Required: `instance`, `difficulty` (may be empty), `max_players`,
`subject=player|guild`, `kind=boss|clear|renown`, `score=peak|mastery|renown`.

For `kind=boss`, choose exactly one `boss`, `set` (set key, not label), or repeated
`bosses` parameters for an arbitrary eligible group (maximum 256 entries before
deduplication). Player
performance also requires `class`, `spec`, `sub_spec` (may be empty), and
`metric=dps|hps`. Clear is guild-only and rejects boss selections. Renown rejects performance
sets/groups but accepts an optional exact `boss` for per-boss cards; omitting it
returns the whole instance/variant total.

Optional: `realm` UUID, `search` literal case-insensitive subject-name substring
(maximum 100 bytes), `limit` 1–50, and `cursor`. Unlinked metadata falls back to the
realm-qualified subject ID. Search and realm filtering occur before aggregation.

`view=cohorts` lists available exact performance cohorts for a validated
instance/variant from the small benchmark table. It does not scan observations.

The API rejects public tenant/dataset/version override parameters. Every evidence
query includes the middleware tenant explicitly, in addition to existing RLS.
Cursors bind tenant, exact effective boss selection, named set, variant,
performance cohort, score, and filters. They preserve full floating-point score
precision, then order realm UUID and bytewise subject ID. There are no offset
pages or fabricated global ranks. Normal result/award changes do not invalidate
cursors; a changed selection does. Like ordinary keyset pagination, mutations
between requests can move rows across the cursor.

## Measured local performance

See [the local tool](../../scripts/leaderboardmock/README.md) for safeguards and
commands. These are **synthetic summaries**, not estimates of production cohorts.
PostgreSQL 17 ran in a local Docker container, default memory settings, on this
execution host. Player/guild metadata was populated for the final matrix. One
realm, 4 seeded exact player cohorts, 13 catalog bosses, 80% deterministic player-boss
coverage, and history count 44 were used. No raw evidence was seeded. The
performance query selects only `MAGE / Synthetic0 / empty subspec / dps`, never
pooling the four seeded cohorts. The benchmark arrays include all 13 catalog bosses as a stress group; they do not
claim to be a particular production named set. API sets use actual resolution.

Warm median of five reads after a first measured read, milliseconds:

| Shape | 416k player summaries / 10k subjects | 2.08m player summaries / 50k subjects |
| --- | ---: | ---: |
| All-boss group Mastery | 50.5 | 305.7 |
| Single boss Peak | 17.7 | 90.8 |
| Player Renown | 60.2 | 305.6 |
| Guild clear Mastery | 0.6 | 2.4 |
| Name-filtered group | 31.7 | 130.6 |
| Subsequent group cursor | 54.6 | 295.0 |

The target is approximately **200ms**, not a demonstrated bound. The moderate
fixture meets it; the 50k-subject group/Renown stress cases **do not**. Cursor
pagination bounds returned rows but cannot avoid evaluating the current aggregate
for all candidate subjects. We did not silently cap candidates, cache stale
scores, or introduce materialized group scores to meet a timing claim.

The final version-independent query was measured on a fresh fixture both without
and with the exact-cohort covering index. Without it, large-group warm median
was 431.6ms; with it, 305.7ms. The index avoids scanning other performance cohorts
and permits index-only scans over vacuumed rows. Explicit bytewise subject
identity ordering avoids locale-sensitive tie ordering. The retained final
plans, query hashes, and table/index sizes are in `benchmarks/`, including the
no-index plan. No version columns participate in this index or query filtering.
These timings still depend on caching, visibility maps, and the local hardware.

Migration345 adds only that measured covering index on the new summary table.
It does not scan historical source/evidence tables or backfill results. Building
an index still scans the target summary table and blocks writes with ordinary
`CREATE INDEX`; if this previously schema-only table has since been populated,
check its production row count/build impact before deployment. The index consumes
additional storage and makes summary writes more expensive. Index-only gains
assume vacuumed visibility maps; remeasure on actively mutated summaries.

No global `work_mem` or planner settings were changed. The first read was not guaranteed cold. No OS or PostgreSQL cache eviction was
performed. `EXPLAIN` execution times exclude configuration resolution, HTTP,
networking, and rendering. They are not end-to-end latency or production promises.
Query plans and exact fixture parameters should be rerun on deployment hardware.

## Validation

The PostgreSQL-backed hand-check tests cover fixed denominators, realm-qualified
identity ties, keyset pages, tenant/variant/cohort separation, search/realm
filters, benchmark-only revaluation, reciprocal guild bands, current awards,
and mixed projection/algorithm metadata across benchmarks, subjects, and Renown
counts. Selection tests cover enabled/empty sets,
explicit-zero variant awards, Vanilla identity, invalid filters, conflicts, and
cursor scope changes. Frontend adapter tests cover root/conflict/empty/zero states, Vanilla identity,
exact player cohorts, variant-scoped Renown and keyset cursor mapping into the
existing player/guild table controls. The Python tests reject remote, implicit, or redirected
database targets.
