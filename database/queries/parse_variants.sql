-- name: GetParseVariantMembershipCohort :many
SELECT CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END::double precision AS metric_value
FROM parse_variant_memberships membership
JOIN wow_log_groups log_group ON log_group.id = membership.log_group_id AND NOT log_group.unlisted
WHERE (
      (@tenant_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid AND membership.tenant_id = @tenant_id)
      OR
      (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid AND (
          membership.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
          OR EXISTS (SELECT 1 FROM tenants tenant WHERE tenant.id = membership.tenant_id AND tenant.include_in_all)
      ))
  )
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND membership.run_id <> @exclude_run_id
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
  AND membership.encounter_variant = @encounter_variant
  AND membership.player_class = @player_class
  AND (@cohort_mode::text <> 'spec' OR (
      membership.player_spec = @player_spec
      AND membership.player_sub_spec = @player_sub_spec
      AND lower(btrim(membership.player_spec)) NOT IN ('', 'unknown')
  ))
  AND CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END > 0;

-- name: InsertParseVariantResult :exec
INSERT INTO parse_variant_results (
    tenant_id, instance_id, encounter_name, difficulty_name, max_players,
    encounter_variant, player_guid, metric, precise_score, display_score, rank, sample_size, status
) VALUES (
    @tenant_id, @instance_id, @encounter_name, @difficulty_name, @max_players,
    @encounter_variant, @player_guid, @metric, @precise_score, @display_score, @rank, @sample_size, @status
)
ON CONFLICT (tenant_id, instance_id, encounter_name, difficulty_name, max_players, encounter_variant, player_guid, metric)
DO NOTHING;

-- name: ListParseVariantResultsForInstance :many
SELECT result.* FROM parse_variant_results result
JOIN log_instances_resolved instance ON instance.id = result.instance_id
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
WHERE result.tenant_id = @tenant_id AND result.instance_id = @instance_id AND result.metric = @metric;
