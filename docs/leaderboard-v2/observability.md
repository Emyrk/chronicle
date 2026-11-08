# Leaderboard observability

## Durable queue truth

`GET /api/v1/admin/leaderboard-queues?tenant_id=<uuid>` requires the existing
`admin_users` capability. It works with no active or previous operation and returns
all nine families, including zeros. `runs` is D1; the remaining eight are D2.
Fields: `pending`, `due`, `claimed`, `retrying`, optional `oldest_pending_at` and
`oldest_due_at`. `collected_at` is the response collection time. The query uses one
statement snapshot and an explicit tenant predicate plus RLS.

Pending includes future, retry-backed-off, and claimed work. Due means both
schedule and retry times have passed and no current lease exists. Claimed and
retrying are separate predicates, not mutually exclusive partitions. Oldest
pending uses `dirtied_at`; repeated mutations can refresh that timestamp. Oldest
due uses `process_after` among claimable rows, not upload/event time.

Queue sizes are **gauges from database truth**, not increment/decrement counters.
Upserts, rollbacks, deletes, retries, process restarts and other replicas make
in-process queue arithmetic incorrect.

## Prometheus collection

The ratings service registers with the existing Chronicle registry; generic River
job metrics are left unchanged. Every 30 seconds one lifecycle-owned collector
processes up to 100 tenants in key order, with a 10-second page budget and
2-second tenant query budgets. It resumes a partial sweep, and removes deleted
tenants from snapshots after a complete sweep. Counts necessarily examine that
tenant's queued rows; timeouts bound collection duration rather than promising
constant-time counts. Large queues can produce stale snapshots.

**Scrapes do no SQL.** A successful refresh replaces the cached tenant snapshot.
Failure preserves the previous values and timestamp, sets tenant collection
success to zero, and increments a collection outcome counter. Initial snapshots
appear only after the first periodic collection. More than 100 tenants can take
multiple periods; freshness must always be considered.

Metrics:

- `chronicle_leaderboard_queue_{pending,due,claimed,retrying}`: tenant/family gauges.
- `chronicle_leaderboard_queue_oldest_{pending,due}_timestamp_seconds`: zero if empty.
- `chronicle_leaderboard_queue_snapshot_timestamp_seconds`: last successful tenant collection.
- `chronicle_leaderboard_queue_collection_success`: last tenant attempt succeeded (0/1).
- `chronicle_leaderboard_queue_collections_total{outcome}`: success/failed/list_failed.
- `chronicle_leaderboard_operation_obligations{tenant,phase}`: latest persisted
  operation's discovered obligations, not unique runs; resets on a new operation.
- `chronicle_leaderboard_operation_last_progress_timestamp_seconds`: persisted progress.
- `chronicle_leaderboard_events_total{tenant,family,phase,outcome}`: local outcomes.
- `chronicle_leaderboard_phase_duration_seconds{tenant,family,phase,outcome}`:
  compute/publication/retry attempts and operation page durations, including failures.

Labels are bounded tenant/family/phase/outcome vocabularies. There are no player,
run, operation ID, free-text error, or arbitrary request labels.

## Counters and commit boundaries

D1 and D2 `publish/committed` counts scopes whose fenced publication was allowed,
**only after the encompassing transaction committed**. This includes deleting a
result with no remaining evidence; it is not a count of inserted rows. D2 SQL
returns its existing fence decision without changing eligibility/locking logic.
`publish/fenced` counts successful no-op publication attempts rejected by ownership
or lease guards. Failed/rolled-back transactions increment neither success counter.

`retry/committed_attempt` counts scopes submitted in a committed token-checked retry
transaction. A replaced owner may make that retry a no-op; the metric deliberately
does not claim an affected-row count. Operation `committed_page` counts committed
active-page transactions, including drain checks, not unique progress or completion.
Duration histograms describe attempts, so failures contribute durations.

Counters are process-local and not an accounting ledger: a process crash between
DB commit and observation can undercount. Direct producer publication runs inside
caller-owned source transactions without a general post-commit hook; no misleading
"committed direct publication" counter is emitted. Its queue effects remain visible
in DB gauges. Adding global callbacks solely for instrumentation was avoided.

## Multiple replicas

Do **not sum replicated DB gauges**. For example:

```promql
max by (tenant, family) (chronicle_leaderboard_queue_pending)
max by (tenant) (chronicle_leaderboard_queue_snapshot_timestamp_seconds)
sum by (tenant, family, outcome) (rate(chronicle_leaderboard_events_total{phase="publish"}[5m]))
```

Filter stale snapshots before interpreting queue gauges. Using max is conservative
when replicas sample at different times, not a globally atomic view. Compute queue
age from timestamps only when nonzero; use a fresh replica's snapshot. Sum local
event rates and histogram buckets across replicas. Keep collection failures and
staleness visible independently of application job success.

## Read-only pilot procedure (operator-run only)

Do not start a backfill, reset data, restart the development server, or modify any
live database to collect observations. In particular, an already-running manual
backfill must be left alone.

1. Record its tenant, existing operation phase/state and current time.
2. Read the admin queue endpoint and operation detail at modest intervals; record
   family counts, oldest timestamps, last progress and retry/error diagnostics.
3. Once deployed metrics exist, observe registry snapshots and confirm freshness
   before comparing them to independently read queue data. Scrapes must not drive
   database query frequency.
4. Observe committed publication rates and phase duration distributions. Compare
   queued work over time, not counter totals, to assess net progress under concurrent
   ingestion. Do not present `discovered` as unique runs or completion percentage.
5. With separately authorized read-only database monitoring, inspect lock waits and
   WAL deltas over the observation window. Attribute shared database WAL cautiously;
   it includes unrelated workloads. This implementation does not fabricate WAL or
   lock-wait metrics from worker duration.
6. Report measured rates, delays, collection failures and the observation window.
   An ETA is only an estimate under the measured workload, not a completion promise.

Tests use isolated dbtestutil databases. No real pilot is launched by validation.

Example alert expressions (choose thresholds for observed workload):

```promql
# No fresh queue observation for a tenant in five minutes.
time() - max by (tenant) (chronicle_leaderboard_queue_snapshot_timestamp_seconds) > 300
# A replica is failing tenant collection; keep replica identity in this alert.
chronicle_leaderboard_queue_collection_success == 0
# Fresh tenant snapshots with persistent queue growth should be investigated.
max by (tenant, family) (chronicle_leaderboard_queue_pending) > 10000
```

Use a sustained alert duration (for example five minutes) and correlate backlog
alerts with snapshot freshness and publication rates; the numeric threshold is
illustrative, not a production capacity limit.
