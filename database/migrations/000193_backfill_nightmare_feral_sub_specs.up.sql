BEGIN;

-- Existing rankings predate Feral sub-spec classification. Assign the default
-- Cat cohort for Feral Druids whose resolved dataset enables Nightmare of
-- Ursol. Bear will be identified on future parses from the full talent layout.
WITH nightmare_datasets AS (
    SELECT id
    FROM datasets
    WHERE 'nightmare-of-ursol' = ANY(default_flavor)
)
UPDATE talent_builds tb
SET sub_spec = 'Cat'
FROM nightmare_datasets nd
WHERE tb.dataset_id = nd.id
  AND tb.player_class = 'DRUID'
  AND tb.spec = 'Feral'
  AND COALESCE(tb.sub_spec, '') = '';

WITH nightmare_realms AS (
    SELECT r.id
    FROM wow_server_realms r
    JOIN wow_servers s ON s.id = r.server_id
    LEFT JOIN tenants t ON t.id = s.tenant_id
    JOIN datasets d
      ON d.id = COALESCE(
          s.default_dataset_id,
          t.default_dataset_id,
          '00000000-0000-0000-0000-000000000001'::uuid
      )
    WHERE 'nightmare-of-ursol' = ANY(d.default_flavor)
)
UPDATE encounter_dps_rankings edr
SET player_sub_spec = 'Cat'
FROM nightmare_realms nr
WHERE edr.realm_id = nr.id
  AND edr.player_class = 'DRUID'
  AND edr.player_spec = 'Feral'
  AND edr.player_sub_spec = '';

-- Snapshot members are denormalized from rankings, so copy the backfilled
-- cohort rather than resolving the dataset a second time.
UPDATE ranking_snapshot_members rsm
SET player_sub_spec = edr.player_sub_spec
FROM encounter_dps_rankings edr
WHERE rsm.ranking_id = edr.id
  AND rsm.player_sub_spec = ''
  AND edr.player_sub_spec <> '';

WITH nightmare_realms AS (
    SELECT r.id
    FROM wow_server_realms r
    JOIN wow_servers s ON s.id = r.server_id
    LEFT JOIN tenants t ON t.id = s.tenant_id
    JOIN datasets d
      ON d.id = COALESCE(
          s.default_dataset_id,
          t.default_dataset_id,
          '00000000-0000-0000-0000-000000000001'::uuid
      )
    WHERE 'nightmare-of-ursol' = ANY(d.default_flavor)
)
UPDATE parse_score_results psr
SET player_sub_spec = 'Cat'
FROM log_instances li
JOIN nightmare_realms nr ON nr.id = li.realm_id
WHERE psr.instance_id = li.id
  AND psr.player_class = 'DRUID'
  AND psr.player_spec = 'Feral'
  AND psr.player_sub_spec = '';

COMMIT;
