-- A Molten Core run with mana and position data where Ragnaros died on the first pull in under 2 minutes with a 90+ kill-time parse vs the realm, a druid tanked trash as Bear then went Cat on Ragnaros for a 95+ DPS parse, at least two shamans did 600+ HPS on Ragnaros, and no warlock died on any boss.
--
-- CEL:
--   instance.name.contains("molten")
--   && "unit-resources" in instance.capabilities
--   && "unit-position" in instance.capabilities
--   && instance.kill_time_ms({"bosses": ["Ragnaros"]}) < 120000
--   && instance.kill_time_parse({"bosses": ["Ragnaros"], "parse_scope": "realm"}) >= 90
--   && !(encounters.exists(e, e.name == "Ragnaros" && e.outcome in ["wipe", "reset"]))
--   && players.exists(p, p.class == "DRUID" && p.sub_spec({"on": "trash"}) == "Bear" && p.sub_spec({"bosses": ["Ragnaros"]}) == "Cat" && p.parse({"bosses": ["Ragnaros"], "metric": "dps"}) >= 95)
--   && players.filter(p, p.class == "SHAMAN" && p.hps({"bosses": ["Ragnaros"]}) >= 600).size() >= 2
--   && !(players.exists(p, p.class == "WARLOCK" && p.deaths({"on": "bosses"}) >= 1))

WITH matched AS (
  SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
    li.id,
    li.hashed_slug,
    COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) AS name,
    li.realm_id,
    wsr.name AS realm_name,
    li.guild_id,
    g.name AS guild_name,
    li.difficulty_name,
    li.max_players,
    COALESCE(li.start_time, wlg.created_at) AS started_at,
    COALESCE(li.start_time, wlg.created_at) AS sort_value
  FROM log_instances li
  JOIN wow_server_realms wsr ON wsr.id = li.realm_id
  JOIN parsed_log_group plg ON plg.id = li.log_group_id
  JOIN wow_log_groups wlg ON wlg.id = plg.id
    AND plg.parse_generation = wlg.parse_generation
    AND plg.finalized_at IS NOT NULL
    AND NOT wlg.unlisted
  LEFT JOIN server_upload_meta sm ON sm.log_group_id = li.log_group_id
  LEFT JOIN guilds g ON g.id = li.guild_id
  WHERE li.invalidated_at IS NULL
    AND ((strpos(lower(COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name)), lower($1::text)) > 0) AND ($2::text = ANY(li.capabilities)) AND ($3::text = ANY(li.capabilities)) AND (EXISTS (SELECT 1 FROM log_instance_encounters k1 WHERE k1.instance_id = li.id AND k1.boss AND k1.kill_type IN ('clean', 'partial') AND lower(k1.name) = ANY(ARRAY(SELECT lower(v) FROM unnest($5::text[]) v)) AND (EXTRACT(EPOCH FROM (k1.end_time - k1.start_time)) * 1000)::bigint < $4::bigint)) AND (EXISTS (SELECT 1 FROM time_parse_scores tps2 JOIN time_parse_boss_scores tbs3 ON tbs3.time_parse_score_id = tps2.id WHERE tps2.tenant_id = $9::uuid AND tps2.instance_id = li.id AND tps2.lookback_days = $6::smallint AND tps2.policy_version = $7::smallint AND tps2.query_version = $8::smallint AND tbs3.realm_status IN ('ok', 'low_confidence') AND lower(tbs3.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($11::text[]) v)) AND tbs3.realm_display_score >= $10::bigint)) AND (NOT (EXISTS (SELECT 1 FROM log_instance_encounters e4 WHERE e4.instance_id = li.id AND ((lower(e4.name) = lower($12::text)) AND (e4.kill_type::text = ANY($13::text[])))))) AND (EXISTS (SELECT 1 FROM log_instance_players p5 WHERE p5.instance_id = li.id AND ((p5.class::text = $14::text) AND (EXISTS (SELECT 1 FROM encounter_dps_rankings r6 WHERE r6.instance_id = li.id AND r6.player_guid = p5.unit_guid::text AND r6.encounter_id IS NULL AND lower(r6.player_sub_spec) = lower($15::text))) AND (EXISTS (SELECT 1 FROM encounter_dps_rankings r7 WHERE r7.instance_id = li.id AND r7.player_guid = p5.unit_guid::text AND r7.encounter_id IS NOT NULL AND lower(r7.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($17::text[]) v)) AND lower(r7.player_sub_spec) = lower($16::text))) AND (EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (x.encounter_name) x.encounter_name, x.display_score, x.status
      FROM parse_score_results x
      WHERE x.tenant_id = $9::uuid AND x.instance_id = li.id AND x.player_guid = p5.unit_guid::text AND x.metric = $18::text
      ORDER BY x.encounter_name, x.created_at DESC, x.precise_score DESC) ps8 WHERE ps8.status IN ('ok', 'low_confidence') AND lower(ps8.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($20::text[]) v)) AND ps8.display_score >= $19::bigint))))) AND ((SELECT count(DISTINCT p9.unit_guid) FROM log_instance_players p9 WHERE p9.instance_id = li.id AND ((p9.class::text = $21::text) AND (EXISTS (SELECT 1 FROM encounter_dps_rankings r10 WHERE r10.instance_id = li.id AND r10.player_guid = p9.unit_guid::text AND r10.encounter_id IS NOT NULL AND lower(r10.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($23::text[]) v)) AND r10.hps >= $22::float8)))) >= $24::bigint) AND (NOT (EXISTS (SELECT 1 FROM log_instance_players p11 WHERE p11.instance_id = li.id AND ((p11.class::text = $25::text) AND (EXISTS (SELECT 1 FROM encounter_dps_rankings r12 WHERE r12.instance_id = li.id AND r12.player_guid = p11.unit_guid::text AND r12.encounter_id IS NOT NULL AND r12.player_deaths >= $26::bigint)))))))
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.id
)
-- Summary columns are computed only for the page of results, after the
-- limit, so they never slow the search itself.
SELECT p.id, p.hashed_slug, p.name, p.realm_id, p.realm_name, p.guild_id, p.guild_name,
  p.difficulty_name, p.max_players, p.started_at,
  (SELECT count(DISTINCT lp.unit_guid) FROM log_instance_players lp WHERE lp.instance_id = p.id) AS player_count,
  (SELECT count(DISTINCT be.name) FROM log_instance_encounters be
    WHERE be.instance_id = p.id AND be.boss AND be.kill_type IN ('clean', 'partial')) AS bosses_killed,
  (SELECT sr.ranked_duration_ms FROM instance_speedruns sr
    WHERE sr.instance_id = p.id AND sr.ranked_duration_ms > 0) AS clear_time_ms,
  to_char(p.sort_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_value
FROM (
  SELECT m.*
  FROM matched m
  WHERE TRUE
  ORDER BY m.sort_value DESC NULLS LAST, m.id DESC
  LIMIT $27
) p
ORDER BY p.sort_value DESC NULLS LAST, p.id DESC

-- args:
[
  "molten",
  "unit-resources",
  "unit-position",
  120000,
  [
    "Ragnaros"
  ],
  60,
  1,
  2,
  "11111111-1111-1111-1111-111111111111",
  90,
  [
    "Ragnaros"
  ],
  "Ragnaros",
  [
    "wipe",
    "reset"
  ],
  "DRUID",
  "Bear",
  "Cat",
  [
    "Ragnaros"
  ],
  "dps",
  95,
  [
    "Ragnaros"
  ],
  "SHAMAN",
  600,
  [
    "Ragnaros"
  ],
  2,
  "WARLOCK",
  1,
  26
]
