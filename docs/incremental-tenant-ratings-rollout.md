# Incremental tenant ratings: pre-deployment review

> [!IMPORTANT]
> This runbook describes the legacy rating subsystem being replaced. The authoritative
> replacement contract is [`docs/leaderboard-v2/`](leaderboard-v2/README.md).

Incremental Renown, Mastery, and Peak updates are implemented alongside a **manual-only** full rebuild. The automatic `daily-rating-score-reconciliation` dispatcher is removed because a full tenant rebuild is too slow; the admin single-tenant and all-tenant rebuild actions remain available for recovery or rule changes. Do not deploy these migrations solely on the basis of local integration tests.

## Migration impact

Migrations 000324–000330 create empty dirty-work, observation, denominator, bootstrap, repair-stamp, and Peak-page tables, their indexes and tenant RLS, plus one nullable column on the newly created Peak-page table. They do **not** backfill, update, delete, or scan historical production rows at startup. Migration 000324 installs row triggers on the existing `renown_kill_facts` and `guild_renown_kill_facts` tables; their DDL requires a brief table lock, and subsequent writes incur an additional tenant lookup and dirty-key upsert for each fact (twice on UPDATE). Migration 000326's row triggers operate on newly created observation tables. Large concurrent writes or a long-running transaction could delay startup while trigger installation waits for a lock. No production row counts, write rate, index plans, WAL volume, or lock duration have been measured yet.

The evidence bootstrap and daily repair are **runtime jobs**, not startup migrations. Bootstrap scans canonical runs in 100-run keyset pages and writes observations; the repair scans source/stamp keys in 200-run pages. Peak refresh rewrites at most 16 subjects per transaction. A dirty Peak cohort still calculates a tenant-wide MAX/MIN over its observations once per revision, and an all-time-only cohort with no period denominator must currently recalculate that aggregate on every page. Subject paging unions live evidence with previously scored subjects so deleted last observations retract old scores. These costs and the shared dirty-cohort row's lock contention need representative production plans and timings.

## Safe production preview (read-only)

Run against each large tenant with a read-only role, first on a replica if available. Replace the UUID with the tenant ID (all-zero UUID for the root tenant); use `EXPLAIN` **without** `ANALYZE` until the cost is reviewed. Estimates are not measurements of actual writes or WAL.

```sql
SELECT relname, reltuples::bigint AS estimated_rows, pg_size_pretty(pg_total_relation_size(oid)) AS size
FROM pg_class
WHERE relname IN ('ranking_runs', 'renown_kill_facts', 'guild_renown_kill_facts',
                  'encounter_dps_rankings', 'player_tenant_rating_boss_scores',
                  'guild_tenant_rating_boss_scores', 'parse_score_results', 'time_parse_scores')
ORDER BY relname;

EXPLAIN (FORMAT JSON)
SELECT rr.run_id FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF('00000000-0000-0000-0000-000000000000'::uuid,
                                                     '00000000-0000-0000-0000-000000000000'::uuid)
  AND rr.run_id > '00000000-0000-0000-0000-000000000000'::uuid
  AND rr.updated_at <= now() AND rr.source_updated_at <= now()
ORDER BY rr.run_id LIMIT 100;
```

After a **separate, approved staging deployment** of the schema, run `EXPLAIN (ANALYZE, BUFFERS, WAL)` on representative tenant/cohort queries in staging (not casually on production), measure bootstrap/repair duration and fact-write throughput, and compare incremental versus full-rebuild boss and scope rows over multiple cohorts, realms, periods, deletions, and representative changes. Automatic full rebuilds are disabled; investigate stalled incremental work rather than assuming a scheduled full rebuild will correct it. Get approval before production rollout if startup-lock or runtime write costs remain uncertain.

## Launch and observe

1. Deploy only after reviewing the migration lock risk. The new tables start empty; **do not click “Rebuild ratings + Renown” to start incremental processing**. Existing active score generations continue serving while the jobs build durable evidence. A tenant without an existing active generation cannot publish incremental scores and would need a deliberate manual baseline rebuild.
2. Watch the River jobs dashboard after startup. `dispatch-live-evidence-bootstrap` starts automatically; `bootstrap-tenant-live-evidence` resumes a 100-run keyset cursor until the source scan and dirty-run queue are both finished. The five-minute observation, Renown, Mastery, and Peak dispatchers then drain dirty work. The daily evidence repair scans source/version state in bounded pages; its `after_run_id` lives in the current job's args, **not** in the bootstrap marker.
3. With a DB role allowed to view the tenant rows, inspect this read-only snapshot repeatedly. The root tenant is the all-zero UUID. Other tenants may be hidden by row-level security unless the role has appropriate access.

```sql
SELECT b.tenant_id, b.after_run_id, b.source_cutoff, b.completed_at,
       (SELECT count(*) FROM rating_dirty_observation_runs d WHERE d.tenant_id = b.tenant_id) AS dirty_runs,
       (SELECT count(*) FROM rating_dirty_renown_subjects d WHERE d.tenant_id = b.tenant_id) AS dirty_renown,
       (SELECT count(*) FROM rating_dirty_mastery_subjects d WHERE d.tenant_id = b.tenant_id) AS dirty_mastery,
       (SELECT count(*) FROM rating_dirty_peak_cohorts d WHERE d.tenant_id = b.tenant_id) AS dirty_peak
FROM rating_live_evidence_bootstraps b ORDER BY b.tenant_id;

SELECT kind, state, count(*) AS jobs, min(created_at) AS oldest_created_at
FROM river_job
WHERE kind IN ('bootstrap-tenant-live-evidence', 'reconcile-tenant-rating-observations',
               'refresh-tenant-renown', 'refresh-tenant-mastery', 'refresh-tenant-peak',
               'repair-live-rating-evidence', 'rebuild-tenant-ratings', 'dispatch-rating-scores')
  AND state IN ('available', 'pending', 'retryable', 'running', 'scheduled')
GROUP BY kind, state ORDER BY kind, state;

SELECT tenant_id, status, id AS generation_id, created_at
FROM rating_score_generations
WHERE status IN ('active', 'building') ORDER BY tenant_id, created_at DESC;
```

A completed bootstrap marker plus falling dirty queues indicates historical catch-up; it does not itself prove score parity. Check a few known boss and raid scores after each queue drains. If any dirty count grows persistently, inspect the corresponding River job errors and DB load instead of triggering a full rebuild. Existing `rebuild-tenant-ratings` jobs already queued or running before deployment **are not canceled by removing the cron**; review them in the River dashboard. The `/admin` → Leaderboard → **Rating maintenance** controls (and `POST /api/v1/admin/ratings/rebuild` for one host tenant, `/rebuild/all` for all tenants) remain the explicit recovery actions, not launch steps.
