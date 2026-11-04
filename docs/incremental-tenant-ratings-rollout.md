# Incremental tenant ratings: pre-deployment review

Incremental Renown, Mastery, and Peak updates are implemented alongside the existing full rebuild. **Keep `daily-rating-score-reconciliation` enabled** until production-scale costs and parity are verified. Do not deploy these migrations solely on the basis of local integration tests.

## Migration impact

Migrations 000322–000328 create empty dirty-work, observation, denominator, bootstrap, repair-stamp, and Peak-page tables, their indexes and tenant RLS, plus one nullable column on the newly created Peak-page table. They do **not** backfill, update, delete, or scan historical production rows at startup. Migration 000322 installs row triggers on the existing `renown_kill_facts` and `guild_renown_kill_facts` tables; their DDL requires a brief table lock, and subsequent writes incur an additional tenant lookup and dirty-key upsert for each fact (twice on UPDATE). Migration 000324's row triggers operate on newly created observation tables. Large concurrent writes or a long-running transaction could delay startup while trigger installation waits for a lock. No production row counts, write rate, index plans, WAL volume, or lock duration have been measured yet.

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

After a **separate, approved staging deployment** of the schema, run `EXPLAIN (ANALYZE, BUFFERS, WAL)` on representative tenant/cohort queries in staging (not casually on production), measure bootstrap/repair duration and fact-write throughput, and compare incremental versus full-rebuild boss and scope rows over multiple cohorts, realms, periods, deletions, and representative changes. Do not disable daily full rebuilds or enable a production rollout until these checks pass and any startup-lock risk has been accepted.
