# PR1 materialization measurements and deployment gate

## Callable contract

`database/queries/leaderboard_materialize.sql` provides eight sqlc entry points.
Each statement reads one exact evidence scope from one PostgreSQL statement
snapshot and either upserts its result or deletes the stale row when no evidence
remains. There is no observation-history limit. The benchmark, subject, and count
calculators are independent. No enqueue, claim, worker, or automatic dispatch is
installed. There is **no concurrent-publication fence** in PR1; callers must not
interpret statement atomicity as revision-safe scheduling. PR2 owns that fence.

Evidence is the already-canonical, eligible input. Calculation does not rerun
source-eligibility policy or filter evidence by compatibility metadata. Explicit
projection/algorithm parameters describe the output only. Raw statistics and
counts are stored, never normalized scores or award points.

Player peak provenance selects the highest metric, then smallest source encounter
UUID (then run UUID for reproducibility). It reads the matching encounter only
when instance ID, encounter name, realm, instance name, difficulty, raid size,
and server tenant agree. Duration is the positive whole-millisecond difference
between that encounter's authoritative end/start timestamps. Missing/mismatched
sources or nonpositive duration yield two NULL provenance fields, without
substituting a different observation or deleting its still-eligible raw metric.

## Reproduction and fixture

Run only against local isolated test databases:

```sh
CHRONICLE_MEASURE_MATERIALIZE=1 go test ./database \
  -run '^TestMaterializeScopedPlans$' -count=1 -v
```

The test creates a new `dbtestutil` database. It does not reuse or overwrite a
preview database, restart services, or contact production. Measurements execute
`EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` on the actual write statements.
The transaction rolls back at completion. The opt-in test drops/recreates only
its own candidate indexes to reproduce the comparison after migration348 exists.

Each of five evidence tables contains 30,000 unrelated rows across 16 tenants
and 32 cohorts, plus a selected subject history of 100, 1,000, or 10,000 rows.
An actual matching source hierarchy and 5,000 unrelated source encounters exercise
provenance lookup. Histories contain ties, zero metrics and nonuniform durations.
Seven repeated executions produce p50 and nearest-rank p95 (the seventh sample).
These are warm local diagnostics, not production latency guarantees.

The baseline uses migration345 scope indexes. Migration348 adds only the three
missing value-ordered benchmark indexes. Existing scope indexes already bound
subject histories and Renown counts. No measured query scanned unrelated evidence
via a sequential table scan. All selected rows remain in the exact predicate,
even where a small-history plan chooses a scoped bitmap scan plus top-N sort.

## Measurements

Times include calculation and publication. WAL is the sum emitted by modifying
plan nodes, not just the root DELETE (which otherwise reports zero for a CTE
INSERT). Blocks are root shared hit/read blocks. Sort is the largest observed
sort space in kB; temp is written temporary blocks.

| Path | History | Family | p50 ms | p95 ms | WAL bytes | Blocks | Sort kB | Temp |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| existing | 10000 | GuildBossBenchmark | 2.492 | 2.738 | 126 | 255 | 25 | 0 |
| existing | 10000 | GuildClearBenchmark | 2.454 | 2.821 | 126 | 225 | 25 | 0 |
| existing | 10000 | PlayerBossBenchmark | 2.633 | 2.971 | 126 | 262 | 25 | 0 |
| indexed | 100 | GuildBossBenchmark | 0.380 | 0.594 | 126 | 258 | 25 | 0 |
| indexed | 100 | GuildBossSubject | 0.474 | 0.524 | 126 | 258 | 32 | 0 |
| indexed | 100 | GuildClearBenchmark | 0.378 | 0.667 | 126 | 227 | 25 | 0 |
| indexed | 100 | GuildClearSubject | 0.467 | 0.558 | 126 | 227 | 32 | 0 |
| indexed | 100 | GuildRenownCount | 0.408 | 0.571 | 126 | 218 | 0 | 0 |
| indexed | 100 | PlayerBossBenchmark | 0.404 | 0.661 | 126 | 264 | 25 | 0 |
| indexed | 100 | PlayerBossSubject | 0.639 | 0.690 | 454 | 274 | 32 | 0 |
| indexed | 100 | PlayerRenownCount | 0.408 | 0.603 | 126 | 206 | 0 | 0 |
| indexed | 1000 | GuildBossBenchmark | 0.041 | 0.086 | 126 | 14 | 0 | 0 |
| indexed | 1000 | GuildBossSubject | 1.229 | 1.402 | 127 | 293 | 103 | 0 |
| indexed | 1000 | GuildClearBenchmark | 0.041 | 0.058 | 126 | 14 | 0 | 0 |
| indexed | 1000 | GuildClearSubject | 1.437 | 1.824 | 126 | 258 | 103 | 0 |
| indexed | 1000 | GuildRenownCount | 0.484 | 0.651 | 126 | 239 | 0 | 0 |
| indexed | 1000 | PlayerBossBenchmark | 0.058 | 0.084 | 126 | 14 | 0 | 0 |
| indexed | 1000 | PlayerBossSubject | 3.316 | 3.731 | 454 | 470 | 103 | 0 |
| indexed | 1000 | PlayerRenownCount | 0.587 | 0.751 | 126 | 226 | 0 | 0 |
| indexed | 10000 | GuildBossBenchmark | 0.045 | 0.083 | 126 | 15 | 0 | 0 |
| indexed | 10000 | GuildBossSubject | 9.287 | 9.508 | 126 | 535 | 1166 | 0 |
| indexed | 10000 | GuildClearBenchmark | 0.052 | 0.092 | 126 | 15 | 0 | 0 |
| indexed | 10000 | GuildClearSubject | 9.709 | 10.841 | 126 | 470 | 1166 | 0 |
| indexed | 10000 | GuildRenownCount | 2.485 | 3.166 | 126 | 451 | 0 | 0 |
| indexed | 10000 | PlayerBossBenchmark | 0.077 | 0.087 | 126 | 15 | 0 | 0 |
| indexed | 10000 | PlayerBossSubject | 12.256 | 12.653 | 455 | 558 | 1166 | 0 |
| indexed | 10000 | PlayerRenownCount | 2.750 | 3.281 | 126 | 427 | 0 | 0 |

At 10k history, benchmark p50 falls from roughly 2.5 ms to 0.045 to 0.077 ms;
index scans return the first qualifying value without sorting the whole cohort.
The full-history player summary remains approximately 12.3 ms, guild summaries
9.3 to 9.7 ms, and counts 2.5 to 2.8 ms. This work intentionally scales with complete
subject history. No sort spilled at the measured sizes; larger histories can.

Representative 10k access paths:

- Benchmarks: corresponding `leaderboard_*_observations_best_idx`; about 15
  shared blocks for the complete statement, no sort.
- Player summary: `leaderboard_player_observations_scope_idx`; source encounter
  and instance primary-key lookups each return one row in one loop. Peak lookup
  is once per subject calculation, not once per historical observation.
- Guild summaries: existing boss/clear scope indexes.
- Counts: existing metric-free player/guild fact scope indexes.
- History indexes report about 21,101 bitmap entries after successive fixture
  replacement; this includes same-scope dead tuples retained by the measurement
  transaction, not unrelated cohorts. Actual visible history is exactly 10,000.
  This deliberately avoids claiming these replacement-heavy measurements reflect
  a vacuumed production index.

## Rollout gate

No production inspection was performed. Before deploying ordinary index builds,
check the three evidence-table sizes and whether writers have been enabled:

```sql
SELECT relname, n_live_tup,
       pg_size_pretty(pg_relation_size(relid)) AS heap_size
FROM pg_stat_user_tables
WHERE relname IN ('leaderboard_player_observations',
                  'leaderboard_guild_boss_observations',
                  'leaderboard_guild_clear_observations');
```

These are estimates. If populated substantially, inspect exact impact off the
startup path and get approval for a maintenance window or online index build.
Migration348 uses transactional `CREATE INDEX`, which scans each table and blocks
writes until commit. Do not silently deploy it to a populated installation.
No historical source tables are indexed or rewritten by this migration.
