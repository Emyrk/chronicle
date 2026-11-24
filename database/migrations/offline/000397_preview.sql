-- Estimates only. Review table/index bytes, tuples, existing definitions, free disk,
-- WAL/replication lag and long-running transactions before approving builds.
SELECT relname, reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(oid)) AS total_size
FROM pg_class WHERE oid IN ('game_players'::regclass, 'guilds'::regclass);
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE tablename IN ('game_players', 'guilds');
SELECT indexrelid::regclass, indisvalid, indisready FROM pg_index
WHERE indrelid IN ('game_players'::regclass, 'guilds'::regclass);
