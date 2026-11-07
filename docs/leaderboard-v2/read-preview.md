# Read-only leaderboard v2 preview

`/leaderboard-v2` uses the existing Hub layout, rating cards, filters and tables.
The alternate plural frontend page has been removed; `/leaderboards/*` is unchanged.
The Hub rating adapter uses the browser API
`GET /api/v1/leaderboards-v2`, under existing optional-auth and request-tenant
middleware. Root requests cannot infer a tenant or select arbitrary evidence.
Use an actual tenant host. Configuration remains available through the inspector.

## Scope

- Player exact-boss, arbitrary-group and named-set Peak/Mastery across all
  cohorts or optional class/spec/subspec filters. Each row uses its own exact
  class/spec/subspec/DPS-or-HPS benchmark and selected instance difficulty/size.
- Guild exact-boss and named-set Peak/Mastery, plus instance clear Peak/Mastery.
- Player and guild Renown from metric-independent counts and current resolved
  awards. Renown sums the selected enabled bosses in the exact difficulty/size.
  Boss, named-set and arbitrary-group selection match Peak/Mastery. Class/spec/metric filters are
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
The existing All classes/All specs overview ranks independently normalized
cohort-qualified rows together. A Frost Mage at 98 ranks below a Survival Hunter
at 99 regardless of different raw DPS scales. A player with multiple specs stays
multiple rows; no best-spec collapse or raw benchmark pooling occurs. One boss maps directly; arbitrary multi-boss selections are sent as repeated
`bosses` parameters. The API validates every member against current enabled
bosses, deduplicates and sorts the selection, and preserves its exact denominator.
Renown ignores class filters and sums the selected bosses in the exact variant, with a
visible notice. Per-boss cards request genuine boss-specific Renown from counts and current
awards, while center Renown sums the current boss selection without averaging. No retired catch-up worker status is implied.

Existing full-list controls use cursor history. Search starts a new cursor chain;
no synthetic total or global rank is displayed. Single-boss player Peak shows raw DPS/HPS; multi-boss Peak shows each selected
boss's normalized Peak (missing bosses zero). Mastery exposes normalized Peak,
Form and Floor averaged over the same fixed selection. Progress is
`sum(min(observation_count, 3)) / (3 * selected_boss_count)`, with per-boss counts
in a keyboard-accessible description; it does not change scores. A single-boss
guild Peak shows its fastest duration. Player duration is shown only when the
raw-peak observation has recorded provenance; legacy nulls and absent dates are
labeled unavailable, never fabricated. One batched detail query enriches only
the returned page with exact tenant/variant/realm/cohort summary data.

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
performance requires `metric=dps|hps`; `class`, `spec`, and `sub_spec` are optional
filters. An explicitly empty `sub_spec` selects the empty-subspec cohort; omission
selects all subspecs. Clear is guild-only and rejects boss selections. Renown accepts the same boss, set or explicit group selectors. Omitting all selectors
on a Renown request resolves the enabled `default` set, never the whole catalog.
An empty default set stays empty; an explicitly selected optional boss can still
contribute its configured award. Renown is a sum, not a per-boss average.

Optional: `realm` UUID, `search` literal case-insensitive subject-name substring
(maximum 100 bytes), `limit` 1–50, and `cursor`. Unlinked metadata falls back to the
realm-qualified subject ID. Search and realm filtering occur before aggregation.

`view=cohorts` lists available exact performance cohorts for a validated
instance/variant from the small benchmark table. It does not scan observations.

The API rejects public tenant/dataset/version override parameters. Every evidence
query includes the middleware tenant explicitly, in addition to existing RLS.
Cursors bind tenant, exact effective boss selection, named set, variant,
performance cohort, score, and filters. They preserve full floating-point score
precision, then order realm UUID, bytewise subject ID, class, spec and subspec. There are no offset
pages or fabricated global ranks. Normal result/award changes do not invalidate
cursors; a changed selection does. Like ordinary keyset pagination, mutations
between requests can move rows across the cursor.

## Measured local performance

See [the local tool](../../scripts/leaderboardmock/README.md) for safeguards and
commands. These are **synthetic summaries**, not estimates of production cohorts.
PostgreSQL 17 ran in a local Docker container, default memory settings, on this
execution host. Player/guild metadata is populated. The final fixture has one
realm, four synthetic cohorts, 50k subjects per cohort, 13 seeded catalog bosses,
80% deterministic coverage and history count 44: 2.08m player summary rows and
200k cohort-qualified candidate rows. These cardinalities are synthetic, not
inferred production population. No raw observations are read.

The **current all-class query** resolves the actual Vanilla ten-boss default set,
normalizes every row against its own cohort benchmark, then aggregates and ranks
across cohorts. Warm median of five reads after a first measured read:

| Current query shape | First read ms | Warm median ms |
| --- | ---: | ---: |
| All-class default-set Mastery | 1287.6 | 1234.7 |
| Explicit Mage/Synthetic0 default-set Mastery | 359.2 | 349.2 |
| All-class Ragnaros Peak | 414.6 | 396.6 |
| Default-set player Renown | 367.9 | 363.4 |

The approximately **200ms target is not met** on this stress fixture. Cursor
pagination limits returned rows, not aggregate candidates. Display-name lookup
is deferred until after the score page; name search still filters before
aggregation. No candidate cap, stale cache, or materialized group score was added.

The earlier thirteen-boss all-cohort stress group measured approximately 2,031ms
warm before the late display-name optimization and 1,847ms after it. These are
not the ten-boss default-set measurements above. Their plans are retained in
`benchmarks/all-cohort-thirteen-boss-*.json`.

Current plans, query hashes, parameters and sizes are retained as
`benchmarks/current-*.json`. Older `stress-*.json` and `read-group.json` are
historical exact-cohort measurements of the earlier query over a thirteen-boss
stress group, **not evidence of all-class overview latency**. That earlier
exact-cohort index comparison measured 431.6ms without the covering index versus
305.7ms with it. The index helps explicit cohort filters and vacuumed index-only
reads; it does not make the all-class aggregate meet the target. No version
columns participate in index eligibility or query filtering.

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
all-cohort defaults and explicit filters, variant-scoped Renown and keyset cursor mapping into the
existing player/guild table controls. The Python tests reject remote, implicit, or redirected
database targets.

## Peak provenance

Migration346 adds nullable `peak_encounter_id` and `peak_duration_ms` to player
boss summaries. They identify the **same observation as raw_peak**, not the
fastest kill. Both must be present (positive duration) or absent. There is no
source foreign key and source deletion/retention is not blocked. The CHECK is
NOT VALID to avoid a startup table scan; new/updated rows are checked and old rows
receive NULLs. No backfill/population worker is added. Future writers must carry
provenance atomically with raw_peak; equal raw peaks choose the lexicographically
smallest source encounter UUID deterministically. Repair legacy rows in place.
The existing table has no source-encounter link, so no extra instance ID or fake
clickable mock link is introduced. Run dates remain unavailable.

### Page-detail overhead

On the existing 2.08m-summary local fixture, the separate exact-cohort detail
lookup for 50 returned players × 10 selected bosses returned 500 records in
5.323ms on the first measured read and 5.660ms warm median (five repeats).
`benchmarks/page-boss-details.json` retains the plan and aligned page parameters.
A live all-cohort Peak HTTP response with those details was 83,961 bytes and
approximately 1,400ms including ranking/config/API overhead. These are separate
measurements, not a before/after latency claim or a production bound. The optional `peak-examples` local fixture now supplies actual synthetic source
encounters and matching durations to at most12 top summaries per catalog boss.
All other summaries retain null provenance. Source deletion is exercised and
rolled back, proving summaries survive without destroying the demonstration.
