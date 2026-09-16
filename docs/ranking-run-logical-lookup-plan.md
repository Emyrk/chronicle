# Ranking-run logical member lookup plan

Measured on September 16, 2026 for issue #667.

## Production sample before the index

The active Railway `legacy` database had:

- 5,698 `log_instances` rows, 2,325 with `duplicate_group_id` set.
- 4,433 logical runs, with at most 8 members in one run.
- A 2,456 KiB table heap and 3,704 KiB total relation size.
- A 280 KiB primary-key index, which is a conservative size estimate for another UUID btree index.

The targeted logical-run predicate scanned every instance:

```text
Seq Scan on log_instances  (actual time=2.180..2.427 rows=8 loops=1)
  Filter: (COALESCE(duplicate_group_id, id) = '1e755c94-fbb1-4373-8d03-7f918f9fbb36'::uuid)
  Rows Removed by Filter: 5690
  Buffers: shared hit=307
Planning Time: 0.619 ms
Execution Time: 2.487 ms
```

## Production-shaped fixture after the index

A local PostgreSQL 17 fixture used 5,698 rows, including 2,325 grouped rows. Creating the expression index took 1.238 ms, produced a 176 KiB index, and generated 148 KiB of WAL. Local timings do not predict Railway storage latency, but the measured production table is only 2.4 MiB and the expected index is approximately 0.3 MiB.

The targeted lookup used the existing primary-key and duplicate-group indexes to resolve affected runs, then used `idx_log_instances_logical_run` to fetch members:

```text
Nested Loop  (actual time=0.019..0.021 rows=2 loops=1)
  CTE affected_runs
    -> Bitmap Heap Scan on log_instances li
         -> BitmapOr
              -> Bitmap Index Scan on log_instances_pkey
              -> Bitmap Index Scan on idx_log_instances_duplicate_group
  -> CTE Scan on affected_runs
  -> Bitmap Heap Scan on log_instances member
       Recheck Cond: (COALESCE(duplicate_group_id, id) = affected_runs.run_id)
       -> Bitmap Index Scan on idx_log_instances_logical_run
            Index Cond: (COALESCE(duplicate_group_id, id) = affected_runs.run_id)
Planning Time: 0.073 ms
Execution Time: 0.031 ms
```

The query keeps the member lookup lateral and non-flattenable. Without that shape, PostgreSQL can flatten the lookup into a hash join and still sequentially scan `log_instances` despite the expression index.

## Migration impact

Migration `000200` uses a regular transactional `CREATE INDEX` to match Chronicle's atomic migration convention. PostgreSQL takes a `SHARE` lock while building it, so reads continue but writes to `log_instances` wait. At the sampled production size, the build scans about 2.4 MiB and writes roughly 0.3 MiB of index data plus WAL, so the startup impact is expected to be brief and does not justify the extra failure states of a concurrent build.
