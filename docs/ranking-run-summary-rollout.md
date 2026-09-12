# Ranking run summary read rollout

Phase 7 of [issue #618](https://github.com/Emyrk/chronicle/issues/618) keeps summary-backed leaderboard reads disabled by default and defines the production verification and cutover procedure. This document does not authorize a production rollout by itself.

## Controls and invariants

- `CHRONICLE_RANKING_SUMMARY_FAST_READS` and `--ranking-summary-fast-reads` default to `false`.
- While disabled, normal leaderboard requests use the reference slow query. Authorized `verify=true` requests still run both implementations for shadow verification.
- When enabled, unsupported filters and missing, stale, dirty, orphaned, or nonstandard summaries automatically use the slow query.
- Eligibility-planning and fast-query errors automatically use the slow query.
- The slow query remains a permanent reference and failsafe unless a later explicit decision removes it.
- Changing the flag requires a normal process restart. It does not rewrite or delete data.

## Before enabling fast reads

1. Deploy the code with the flag unset or explicitly set to `false`.
2. Install `deploy/prometheus/ranking-run-summaries.rules.yml` in the production Prometheus rule configuration.
3. Confirm the rebuild queue is healthy:
   - `chronicle_rankings_run_summaries_dirty_queue_depth` normally drains toward zero.
   - `chronicle_rankings_run_summaries_oldest_dirty_age_seconds` remains below 15 minutes.
   - `chronicle_rankings_run_summaries_rebuild_failures_total` is not increasing.
4. Use the administrator verification control on representative root and tenant leaderboard URLs.
5. Verify both DPS and HPS with representative combinations of:
   - full-run and custom encounter selections;
   - class, spec, sub-spec, role, and unknown-player filters;
   - difficulty, raid size, realm, and period filters;
   - first and later pagination pages.
6. Require matching response rows, metadata, ordering, and total counts. Treat any bounded-difference result as a rollout blocker.

## Gradual enablement

1. Enable the flag on the smallest deployment slice supported by the production platform.
2. Watch fast versus slow path counts using `chronicle_rankings_run_summaries_leaderboard_queries_total`.
3. Hold each stage long enough to cover normal parsing, resync, deletion, retention, and rebuild activity.
4. Continue manual shadow verification across representative tenants and filters at every stage.
5. Increase the enabled slice only while mismatch alerts remain quiet, dirty work remains fresh, and automatic fallback rates are understood.
6. Enable all instances only after the staged checks remain healthy.

## Rollback

Set `CHRONICLE_RANKING_SUMMARY_FAST_READS=false` or remove it, then restart the affected process normally. This immediately returns normal leaderboard traffic to the slow query without a data migration or destructive cleanup. Keep the summary rebuild worker running so verification and a later retry remain possible.

Investigate before resuming if either alert fires:

- `ChronicleRankingLeaderboardMismatch`: disable fast reads immediately and compare the reported request with `verify=true`.
- `ChronicleRankingRunSummaryDirtyWorkStale`: keep fast reads disabled or roll them back until the queue and worker recover.
