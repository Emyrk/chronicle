-- Reconciliation owns this stamp in the same transaction as evidence and the
-- dirty-run acknowledgement. No canonical row means a deleted run.
-- name: RefreshLiveEvidenceRevision :exec
WITH source AS (
  SELECT rr.run_id, rr.representative_instance_id, rr.source_updated_at, rr.updated_at,
    (SELECT count(*)::integer FROM rating_live_player_observations p
     WHERE p.tenant_id = @tenant_id AND p.run_id = rr.run_id) AS player_count,
    (SELECT count(*)::integer FROM rating_live_guild_observations g
     WHERE g.tenant_id = @tenant_id AND g.run_id = rr.run_id) AS guild_count
  FROM ranking_runs rr
  JOIN wow_server_realms realm ON realm.id = rr.realm_id
  JOIN wow_servers server ON server.id = realm.server_id
  WHERE rr.run_id = @run_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
), removed AS (
  DELETE FROM rating_live_evidence_revisions stamp
  WHERE stamp.tenant_id = @tenant_id AND stamp.run_id = @run_id
    AND NOT EXISTS (SELECT 1 FROM source)
)
INSERT INTO rating_live_evidence_revisions
  (tenant_id, run_id, representative_instance_id, source_updated_at, run_updated_at,
   player_observation_count, guild_observation_count)
SELECT @tenant_id, run_id, representative_instance_id, source_updated_at, updated_at,
       player_count, guild_count FROM source
ON CONFLICT (tenant_id, run_id) DO UPDATE SET
  representative_instance_id = EXCLUDED.representative_instance_id,
  source_updated_at = EXCLUDED.source_updated_at,
  run_updated_at = EXCLUDED.run_updated_at,
  player_observation_count = EXCLUDED.player_observation_count,
  guild_observation_count = EXCLUDED.guild_observation_count;

-- A fixed cutoff and ordered keyset make each daily audit resumable across
-- retries. Bound each input before UNION so a tenant never materializes its
-- entire history for one page; include stamps for deleted canonical runs.
-- name: ListLiveEvidenceRepairPage :many
WITH keys AS (
  (SELECT rr.run_id FROM ranking_runs rr
   JOIN wow_server_realms realm ON realm.id = rr.realm_id
   JOIN wow_servers server ON server.id = realm.server_id
   WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
     AND rr.run_id > @after_run_id AND rr.updated_at <= @source_cutoff::timestamptz
     AND rr.source_updated_at <= @source_cutoff::timestamptz
   ORDER BY rr.run_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200))
  UNION
  (SELECT stamp.run_id FROM rating_live_evidence_revisions stamp
   WHERE stamp.tenant_id = @tenant_id AND stamp.run_id > @after_run_id
   ORDER BY stamp.run_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200))
)
SELECT keys.run_id,
  (stamp.run_id IS NULL OR rr.run_id IS NULL
   OR stamp.representative_instance_id IS DISTINCT FROM rr.representative_instance_id
   OR stamp.source_updated_at IS DISTINCT FROM rr.source_updated_at
   OR stamp.run_updated_at IS DISTINCT FROM rr.updated_at
   OR stamp.player_observation_count IS DISTINCT FROM (
       SELECT count(*)::integer FROM rating_live_player_observations p
       WHERE p.tenant_id = @tenant_id AND p.run_id = keys.run_id)
   OR stamp.guild_observation_count IS DISTINCT FROM (
       SELECT count(*)::integer FROM rating_live_guild_observations g
       WHERE g.tenant_id = @tenant_id AND g.run_id = keys.run_id)) AS needs_repair
FROM keys
LEFT JOIN rating_live_evidence_revisions stamp
  ON stamp.tenant_id = @tenant_id AND stamp.run_id = keys.run_id
LEFT JOIN ranking_runs rr ON rr.run_id = keys.run_id
  AND EXISTS (SELECT 1 FROM wow_server_realms realm
              JOIN wow_servers server ON server.id = realm.server_id
              WHERE realm.id = rr.realm_id
                AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
ORDER BY keys.run_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- Do not bump a dirty revision on every audit retry; existing intent is enough.
-- name: MarkMissingLiveEvidenceRevision :exec
INSERT INTO rating_dirty_observation_runs (tenant_id, run_id)
VALUES (@tenant_id, @run_id)
ON CONFLICT (tenant_id, run_id) DO NOTHING;
