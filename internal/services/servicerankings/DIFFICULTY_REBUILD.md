# Encounter-difficulty normalization rollout

This is an operator-run rebuild, not a startup migration. Obtain production row
counts and approval for the selected tenant/date window before starting. Keep
transactions bounded, throttle queue concurrency, and monitor WAL, replication
lag, queue failures, and request latency. Retain the selected instance IDs and a
checkpoint so interrupted batches can resume.

## Version gates

- Bump `parsepolicy.QueryVersion` from 4 to 5 and
  `timeparsepolicy.QueryVersion` from 2 to 3 with the query change. These are
  membership/query changes, not changes to either scoring algorithm version.
- Ranking summaries use query version 5 so an unchanged row count cannot hide
  changed cohort semantics. Old cohort summaries still require explicit cleanup.
- A parse query-version bump **does not invalidate historical receipts**.
  `WorkerComputeParseScores` skips any existing receipt, then separately skips
  any existing results. `ListInstancesMissingParseReceiptWindowed` also excludes
  both. The historical API accepts any receipt regardless of version.
- Time scores are selected by policy/query version. New-version scores are
  missing until rebuilt, even if an older score exists. Do not start scoring
  before new-version memberships are populated or small-cohort results will
  become the new locked results.
- Ratings publication is driven by dirty keys, not by an automatic comparison
  of projection-version constants. A version-only edit cannot refresh existing
  evidence, D2 results, careers, or highlights. Run the bounded operation below.

## Ordered rebuild

1. **Source data and canonical runs.** Deploy the schema, ingestion, resolved
   reads, and query-version changes together. Run the DB-owned bounded backfill
   or reparse selected logs. Preserve raw instance labels and nullable legacy
   encounter difficulty; write resolved normalized values to derived cohorts.
   Recompute mixed status from boss attempts, including wipes but not trash.
   Clear ranked and boss-to-boss clear eligibility for mixed instances while
   retaining raw timings/proof. Reparse is necessary to recover same-name
   variants discarded by old ingestion; a database rebuild cannot invent them.
2. **Memberships and summaries.** Refresh canonical ranking runs, parse
   memberships, and both time-membership families for each affected log group.
   Include the complete preceding lookback population, not just the target runs.
   Verify current-version membership counts per normalized difficulty/size before
   enqueuing scores. Refresh ranking summaries at version 5, and remove obsolete
   label buckets through the DB-owned bounded maintenance path.
3. **Parse scores.** For each approved tenant/instance, acquire the same
   `AcquireParseScoreLock(instanceID.String())` lock as the worker in a database
   transaction. Delete **both** its receipts and persisted results, then enqueue
   `ArgsComputeParseScores` after commit (or atomically with the queue insert).
   Persist a retryable job/checkpoint so a process crash after deletion cannot
   leave an instance permanently unscored. Preserve unrelated tenant/instance
   history. There is no parse-worker `Force` flag. Automatic repair is recent-only,
   so explicitly enqueue old selected instances. Do not delete locked history
   until the source and entire relevant membership window have been rebuilt.
4. **Time scores.** Enqueue River kind `backfill-time-parse-scores` with an
   explicit `tenant_id`, RFC3339 `started_after`/`started_before`, `batch_size: 100`
   (maximum 500), and `force: false`. Wait for each batch to drain and repeat until
   `candidates` is zero. The new query version makes old scores eligible without
   force. The job does not automatically enqueue the next page. Repeating
   `force: true` with identical bounds can repeatedly select the same first batch;
   use explicit bounded instances/windows if replacing already-current scores.
5. **Ratings.** Run the existing tenant-scoped leaderboard repair operation over
   the approved runs/date range after source and time scoring finish. D1 replaces
   run evidence and enqueues both OLD and NEW cohort keys. Let all D2 families,
   career work, and highlights drain. Include the operation's evidence/result
   repair phases so obsolete cohort results and removed evidence are reconciled,
   rather than merely recomputing newly discovered source rows.

## Acceptance and cleanup

- Same instance/player/boss at normal and heroic produces two parse rows per
  metric, two independent rating cohorts, and two encounter timing scores.
- Empty normal, heroic, and arbitrary variants do not share membership buckets;
  raid size always comes from the instance.
- Mixed instances retain boss evidence but have no ranked clear score/evidence.
- Legacy labels do not remain in rebuilt membership or materialized cohort keys.
- Receipts and source/result counts match the rebuilt variant set. New-version
  timing scores exist for every eligible selected instance. No failed dirty
  work remains, and old-label D2 results are gone.
- Compare sampled before/after reports, including legacy fallback logs and mixed
  wipes, before expanding the window. Retire old-version memberships/time scores
  only through a separately bounded cleanup after consumers have switched.

This document describes required orchestration. It does not add a new deletion
endpoint or execute destructive maintenance automatically.
