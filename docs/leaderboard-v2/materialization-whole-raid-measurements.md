# Whole-raid materialization workload

This supplements the scoped PR1 EXPLAIN measurements with actual sequential
calls to all eight current sqlc calculators. It adds no worker, queue writer,
batch API, runtime behavior, or production transaction policy.

## What one raid means

The synthetic workload has 40 players, 12 bosses, one guild, and eight distinct
class/spec/subspec cohorts of five players each. The fixture is shaped like a
40-player Molten Core raid, not a new canonical encounter or difficulty seed.
It uses one metric and, separately, two metrics for every player. The second
metric deliberately does **not** create another kill fact.

| Records / calls | One metric | Two metrics |
|---|---:|---:|
| Player observations appended | 480 | 960 |
| Player kill facts appended | 480 | 480 |
| Guild boss observations + kill facts + clear observation | 25 | 25 |
| **Total evidence rows appended** | **985** | **1,465** |
| Player raw-summary refreshes | 480 | 960 |
| Player count refreshes | 480 | 480 |
| Guild boss summaries + counts + clear summary | 25 | 25 |
| **Non-benchmark calculator calls / resulting rows** | **985** | **1,465** |
| Player benchmark refreshes, 12 bosses × 8 cohorts × metrics | 96 | 192 |
| Guild boss benchmarks + clear benchmark | 13 | 13 |
| **All calculator calls / resulting rows** | **1,094** | **1,670** |

Benchmark keys are refreshed once per distinct cohort, not once for every
player in that cohort. Count keys are refreshed once, not once per metric. This
loop models the eventual D2 deduplicated key set; it does **not** exercise a D2
queue or claim operation, since those do not exist yet.

**One calculator call means one exact scope, not one observation.** A player
summary returns one materialized row after reading and sorting that subject's
complete eligible history. At 1,000 prior kills, each refreshed subject now has
1,001 observations in its scope. Changing a future claim-page size would change
how many such scopes a worker claims, not truncate the histories inside them.

The existing implementation has no multi-scope SQL calculation, `pgx.Batch`,
pipelining, or concurrent worker loop. The test makes 1,094 or 1,670 real,
sequential sqlc calls. A transaction around those calls is **not** a protocol
batch: each statement still incurs its client/server request.

## Reproduction and limits

```sh
CHRONICLE_MEASURE_RAID=1 go test ./database \
  -run '^TestMaterializeWholeRaid$' -count=1 -v
```

The six cells run sequentially to limit resource pressure. Each has a dedicated
new `dbtestutil` database, a three-minute cell deadline, and a thirty-second
refresh-pass deadline. The measured fixture contains 10, 100, or 1,000 previous
kills per player/boss. Another tenant/raid has 100 complete historical raids:
98,500 unrelated evidence rows for one metric, or 146,500 for two metrics.
Existing migration347 indexes are present and tables are analyzed after seeding.

Before timing the new raid, the test materializes the previous state. It then
commits one appended raid and measures:

1. All affected calculators sequentially in one transaction, including commit.
2. All calculators sequentially in autocommit over the **same final evidence**.

The second pass is a warm idempotent publication, not another appended raid.
This ordering can favor it, so these numbers do not establish a production
transaction-policy winner. Future scheduling still needs bounded transactions
and revision-safe publication fencing. This test does not implement either.

The source log hierarchy is absent, so player provenance remains nullable.
The earlier scoped EXPLAIN fixture separately measures present-source indexed
lookups. Initial seeding and previous-state materialization are reported
separately, not charged to the new raid. No 10,000-kill whole-raid run was made;
the earlier test measured 10,000 observations for one scope, not 40×12 scopes.

## Observed local wall times

One pass per cell, not a latency distribution or a p50/p95 estimate. The full
six-cell measurement took 61.4 seconds including setup and cleanup. PostgreSQL
13.21 on localhost reported `fsync=on`, `synchronous_commit=on`, and 128 MB
shared buffers. No production or remote-network performance is inferred.

| Prior kills per player/boss | Metrics | Calculator calls | Append evidence ms | Refresh, one transaction ms | Refresh, autocommit ms |
|---|---:|---:|---:|---:|---:|
| 10 | 1 | 1,094 | 11.9 | 211.4 | 219.7 |
| 10 | 2 | 1,670 | 19.8 | 311.8 | 331.7 |
| 100 | 1 | 1,094 | 13.3 | 229.1 | 234.5 |
| 100 | 2 | 1,670 | 20.9 | 389.4 | 400.7 |
| 1,000 | 1 | 1,094 | 18.7 | 958.2 | 977.4 |
| 1,000 | 2 | 1,670 | 34.1 | 1,725.3 | 1,644.8 |

At 100 prior kills this local complete refresh was roughly 0.23 seconds for one
metric and 0.39 seconds for two. At 1,000 it was roughly 0.96 and 1.73 seconds.
These are measured complete loops, not multiplication of a microbenchmark.
They demonstrate full-history cost growth, not a guarantee under real load.

| Prior history | Metrics | Initial evidence seed ms, including unrelated rows | Previous-state materialization ms |
|---|---:|---:|---:|
| 10 | 1 | 1,271.3 | 202.8 |
| 10 | 2 | 1,978.1 | 300.6 |
| 100 | 1 | 2,135.9 | 227.5 |
| 100 | 2 | 3,700.7 | 377.7 |
| 1,000 | 1 | 13,513.4 | 992.1 |
| 1,000 | 2 | 24,757.5 | 1,817.9 |

The thirty-second cutoff applies to refresh passes, not fixture seeding. The
largest complete cell took 30.5 seconds, mostly preparing historical evidence.

## WAL and caveats

The test logs differences in `pg_current_wal_insert_lsn()` around append and
refresh intervals. These are **shared local-cluster WAL intervals**, not
query-attributed WAL and not a durable production bytes-per-raid estimate.
Concurrent activity, full-page images, checkpoints, and vacuum work can affect
them. For isolated statement-level WAL, use the earlier EXPLAIN measurements.

Observed refresh intervals were about 689 kB / 1,133 kB for one/two metrics in
the transaction pass, and about 490 kB / 801 kB in the subsequent autocommit
pass. The first pass cannot reuse tuples it updated earlier in its transaction;
the subsequent pass can also benefit from changed cache/page state. Do not infer
that autocommit universally emits less WAL from this ordered comparison.
Append intervals ranged from about 0.8 to 18.5 MB, reinforcing that these global
intervals must not be treated as isolated insert amplification.

Backend CPU was not separately attributed; reported time is end-to-end wall
time including Go iteration, SQL execution, local transport, and commits. No
preview database was reused, no server was restarted, and no production queries
were made. Every dedicated database from the initial parameter-typing failure, successful
matrices, and final smoke check was verified dropped after test cleanup.
