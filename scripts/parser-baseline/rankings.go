package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

var rankingFields = strings.Fields("id encounter_id instance_id encounter_name instance_name player_guid player_name player_class player_spec player_role player_level talent_build_id difficulty_name max_players realm_id realm_name guild_id guild_name damage_done duration_secs dps avg_ilvl killed_at healing_done absorbed_done hps player_sub_spec player_deaths alive_percentage unranked_damage_done")
var talentFields = strings.Fields("id dataset_id player_class talent_summary talent_layout spec sub_spec")
var parseMembershipFields = strings.Fields("id tenant_id policy_version query_version run_id encounter_name player_guid instance_id log_group_id difficulty_name max_players player_class player_spec player_sub_spec killed_at dps hps")
var clearMembershipFields = strings.Fields("id tenant_id policy_version query_version run_id instance_id log_group_id instance_name difficulty_name max_players duration_ms start_time")
var bossMembershipFields = strings.Fields("id tenant_id policy_version query_version run_id encounter_name instance_id log_group_id instance_name difficulty_name max_players duration_ms killed_at")

type rankingData struct {
	Rankings []database.EncounterDpsRanking
	Talents  []database.TalentBuild
	Guilds   []database.Guild
	Parses   []database.ParseScoreMembership
	Clears   []database.TimeParseClearTimeMembership
	Bosses   []database.TimeParseBossKillMembership
}

type rankingOutput struct {
	Rankings []map[string]any `json:"encounter_dps_rankings"`
	Talents  []map[string]any `json:"talent_builds"`
	Parses   []map[string]any `json:"parse_score_memberships"`
	Clears   []map[string]any `json:"time_parse_clear_time_memberships"`
	Bosses   []map[string]any `json:"time_parse_boss_kill_memberships"`
}

func loadRankings(ctx context.Context, db database.Store, logID uuid.UUID) (rankingData, error) {
	var d rankingData
	var err error
	if d.Rankings, err = db.BaselineEncounterRankings(ctx, logID); err != nil {
		return d, err
	}
	if d.Talents, err = db.BaselineTalentBuilds(ctx, logID); err != nil {
		return d, err
	}
	if d.Guilds, err = db.BaselineRankingGuilds(ctx, logID); err != nil {
		return d, err
	}
	if d.Parses, err = db.BaselineParseMemberships(ctx, logID); err != nil {
		return d, err
	}
	if d.Clears, err = db.BaselineClearMemberships(ctx, logID); err != nil {
		return d, err
	}
	d.Bosses, err = db.BaselineBossMemberships(ctx, logID)
	return d, err
}

// References must resolve inside the exported scope. In particular, a seeded
// duplicate-run representative outside this log group must fail, not disappear
// from the membership query or be compared using an unstable UUID.
func canonicalRankings(d rankingData, logID uuid.UUID, instances []database.LogInstancesGuild, instanceIDs, encounterIDs map[uuid.UUID]string) (rankingOutput, error) {
	out := rankingOutput{Rankings: []map[string]any{}, Talents: []map[string]any{}, Parses: []map[string]any{}, Clears: []map[string]any{}, Bosses: []map[string]any{}}
	talents := make(map[uuid.UUID]string)
	guilds := make(map[uuid.UUID]string)
	runs := make(map[uuid.UUID]string)
	instanceRuns := make(map[uuid.UUID]uuid.UUID)
	for _, instance := range instances {
		run := instance.ID
		if instance.DuplicateGroupID.Valid {
			run = instance.DuplicateGroupID.UUID
		}
		key, ok := instanceIDs[run]
		if !ok {
			return out, fmt.Errorf("duplicate run anchor %s is outside exported scope", run)
		}
		runs[run] = "run/" + key
		instanceRuns[instance.ID] = run
	}
	for _, guild := range d.Guilds {
		key, err := identity("guild", guild.RealmID, guild.Name)
		if err != nil {
			return out, err
		}
		if err := addReference(guilds, guild.ID, key); err != nil {
			return out, err
		}
	}
	for _, talent := range d.Talents {
		key, err := identity("talent", talent.DatasetID, talent.PlayerClass, talent.TalentLayout)
		if err != nil {
			return out, err
		}
		if err := addReference(talents, talent.ID, key); err != nil {
			return out, err
		}
		row, err := project(talent, talentFields)
		if err != nil {
			return out, err
		}
		row["id"] = key
		out.Talents = append(out.Talents, row)
	}
	for _, ranking := range d.Rankings {
		ranking.KilledAt = exactTime(ranking.KilledAt)
		row, err := project(ranking, rankingFields)
		if err != nil {
			return out, err
		}
		parent, ok := instanceIDs[ranking.InstanceID]
		if !ok {
			return out, fmt.Errorf("missing ranking instance %s", ranking.InstanceID)
		}
		row["instance_id"] = parent
		if ranking.EncounterID.Valid {
			key, ok := encounterIDs[ranking.EncounterID.UUID]
			if !ok || !strings.HasPrefix(key, parent+"/encounter/") {
				return out, fmt.Errorf("missing or cross-instance ranking encounter %s", ranking.EncounterID.UUID)
			}
			row["encounter_id"] = key
		}
		if ranking.TalentBuildID.Valid {
			key, ok := talents[ranking.TalentBuildID.UUID]
			if !ok {
				return out, fmt.Errorf("missing talent build %s", ranking.TalentBuildID.UUID)
			}
			row["talent_build_id"] = key
		}
		if ranking.GuildID.Valid {
			key, ok := guilds[ranking.GuildID.UUID]
			if !ok {
				return out, fmt.Errorf("missing ranking guild %s", ranking.GuildID.UUID)
			}
			row["guild_id"] = key
		}
		parts := []any{parent, row["encounter_id"], ranking.EncounterName, ranking.PlayerGuid}
		if !ranking.EncounterID.Valid {
			parts = append(parts, ranking.PlayerSpec, ranking.PlayerSubSpec)
		}
		key, err := identity("ranking", parts...)
		if err != nil {
			return out, err
		}
		row["id"] = key
		out.Rankings = append(out.Rankings, row)
	}
	for _, member := range d.Parses {
		member.KilledAt = exactTime(member.KilledAt)
		row, err := project(member, parseMembershipFields)
		if err != nil {
			return out, err
		}
		if err := membershipReferences(row, member.InstanceID, member.RunID, member.LogGroupID, logID, instanceIDs, runs, instanceRuns); err != nil {
			return out, err
		}
		row["id"], err = identity("parse-membership", row["tenant_id"], row["policy_version"], row["query_version"], row["run_id"], member.EncounterName, member.PlayerGuid)
		if err != nil {
			return out, err
		}
		out.Parses = append(out.Parses, row)
	}
	for _, member := range d.Clears {
		member.StartTime = exactTime(member.StartTime)
		row, err := project(member, clearMembershipFields)
		if err != nil {
			return out, err
		}
		if err := membershipReferences(row, member.InstanceID, member.RunID, member.LogGroupID, logID, instanceIDs, runs, instanceRuns); err != nil {
			return out, err
		}
		row["id"], err = identity("clear-membership", row["tenant_id"], row["policy_version"], row["query_version"], row["run_id"])
		if err != nil {
			return out, err
		}
		out.Clears = append(out.Clears, row)
	}
	for _, member := range d.Bosses {
		member.KilledAt = exactTime(member.KilledAt)
		row, err := project(member, bossMembershipFields)
		if err != nil {
			return out, err
		}
		if err := membershipReferences(row, member.InstanceID, member.RunID, member.LogGroupID, logID, instanceIDs, runs, instanceRuns); err != nil {
			return out, err
		}
		row["id"], err = identity("boss-membership", row["tenant_id"], row["policy_version"], row["query_version"], row["run_id"], member.EncounterName)
		if err != nil {
			return out, err
		}
		out.Bosses = append(out.Bosses, row)
	}
	for _, rows := range [][]map[string]any{out.Rankings, out.Talents, out.Parses, out.Clears, out.Bosses} {
		if err := sortUniqueRows(rows); err != nil {
			return out, err
		}
	}
	return out, nil
}

func membershipReferences(row map[string]any, instance, run, group, expectedGroup uuid.UUID, instances, runs map[uuid.UUID]string, instanceRuns map[uuid.UUID]uuid.UUID) error {
	parent, ok := instances[instance]
	if !ok || group != expectedGroup {
		return fmt.Errorf("membership representative outside exported log group")
	}
	runKey, ok := runs[run]
	if !ok || instanceRuns[instance] != run {
		return fmt.Errorf("missing or inconsistent membership run %s", run)
	}
	row["instance_id"] = parent
	row["run_id"] = runKey
	row["log_group_id"] = "log-group"
	return nil
}

func identity(prefix string, values ...any) (string, error) {
	data, err := json.Marshal(values)
	return prefix + "/" + string(data), err
}
func addReference(refs map[uuid.UUID]string, id uuid.UUID, key string) error {
	if _, ok := refs[id]; ok {
		return fmt.Errorf("duplicate reference ID %s", id)
	}
	for _, existing := range refs {
		if existing == key {
			return fmt.Errorf("ambiguous reference identity %s", key)
		}
	}
	refs[id] = key
	return nil
}
func sortUniqueRows(rows []map[string]any) error {
	slices.SortFunc(rows, func(a, b map[string]any) int { return strings.Compare(a["id"].(string), b["id"].(string)) })
	for i := 1; i < len(rows); i++ {
		if rows[i-1]["id"] == rows[i]["id"] {
			return fmt.Errorf("ambiguous row identity %s", rows[i]["id"])
		}
	}
	return nil
}

// Project only the explicit allowlist. UseNumber preserves bigint evidence and
// the shortest exact float64 JSON representation, without intermediate rounding.
func project(value any, fields []string) (map[string]any, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var all map[string]any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&all); err != nil {
		return nil, err
	}
	row := make(map[string]any, len(fields))
	for _, field := range fields {
		v, ok := all[field]
		if !ok {
			return nil, fmt.Errorf("missing allowlisted field %s", field)
		}
		row[field] = v
	}
	return row, nil
}
