# Search suggestion indexes: deployment gate

Production row counts, table bytes, free disk, write volume and replica lag are
not available in this checkout. **Deployment is blocked until an operator has
reviewed that information and approved the concurrent builds.** No production
build-time or WAL estimate can safely be inferred from test fixtures.

1. Run `000397_preview.sql` on the target database. Record estimates, current
   index definitions, disk headroom, write load and long-running transactions.
2. Estimate build time and WAL using a representative staging copy. Schedule
   the two scans for an approved low-load window and monitor replication lag.
3. Run `000397_prepare_search_indexes.sql` outside a transaction, one build at
   a time. These are concurrent builds, not free work: they scan the tables,
   consume disk/IO, generate WAL and may wait for old transactions.
4. Check `indisvalid` and `indisready` and compare the exact index definitions
   with the preparation script. If a build failed, drop the INVALID index
   concurrently before retrying. Do not hide an invalid index with IF NOT EXISTS.
5. Deploy only after both indexes are ready. Migration 397 refuses to build
   indexes on populated tables. Empty new/test installations build directly.

The query walks `(realm_id, lower(name) COLLATE "C", id)` for each visible realm,
keeping at most five rows per realm and merging only those small candidate
sets. No raid history, guild membership counts or claimed-guild filters are
consulted. Validate representative exact/common/rare/Unicode prefixes with
`EXPLAIN (ANALYZE, BUFFERS)` on staging, including prepared statement plans,
before deployment. The endpoint additionally bounds concurrent work and time.

Local validation used 10,000 synthetic rows in each entity table and forced
`plan_cache_mode=force_generic_plan`. Both queries used their suggestion index
with realm equality and both folded-name range conditions for a missing prefix;
the all-maximum-code-point branch was not executed. This proves indexability,
not production capacity. The all-maximum prefix has no finite successor and
uses a separate lower-bound-only branch. Integration tests cover that case and
the Unicode surrogate boundary as well as ordinary Unicode case folding.
