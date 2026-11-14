package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

var publicationFields = map[string][]string{
	"guilds":                    strings.Fields("id realm_id name"),
	"game_players":              strings.Fields("id realm_id guild_id name class gender race gear updated_at updated_from_instance level talents"),
	"game_player_gear_history":  strings.Fields("player_id realm_id instance_id gear avg_ilvl equipped_at"),
	"instance_loot":             strings.Fields("id instance_id realm_id source_guid source_ts received_guid received_ts item_id item_name loot_suffix quantity"),
	"instance_overview_metrics": strings.Fields("instance_id requirements_complete player_deaths wipe_count top_incoming_damage_abilities encounter_span_duration_ms total_combat_duration_ms total_boss_duration_ms metrics_version"),
	"instance_speedruns":        strings.Fields("instance_id instance_name realm_id guild_id qualified start_time completion_time duration_ms proof addon_version ranked_start_time ranked_completion_time ranked_duration_ms boss_to_boss_start_time boss_to_boss_completion_time boss_to_boss_duration_ms"),
}

const armoryScope = "public single-log parse; guilds/game_players/game_player_gear_history empty before parse; no concurrent writers"

type publicationData struct {
	Guilds    []database.Guild
	Players   []database.GamePlayer
	Gear      []database.GamePlayerGearHistory
	Loot      []database.InstanceLoot
	Overview  []database.InstanceOverviewMetric
	Speedruns []database.InstanceSpeedrun
}

type publicationOutput struct {
	SharedStateScope string           `json:"shared_state_scope"`
	Guilds           []map[string]any `json:"guilds"`
	Players          []map[string]any `json:"game_players"`
	Gear             []map[string]any `json:"game_player_gear_history"`
	Loot             []map[string]any `json:"instance_loot"`
	Overview         []map[string]any `json:"instance_overview_metrics"`
	Speedruns        []map[string]any `json:"instance_speedruns"`
}

func requireEmptyArmory(ctx context.Context, db database.Store) error {
	counts, err := db.BaselineSharedArmoryCounts(ctx)
	if err != nil {
		return err
	}
	if counts.Guilds != 0 || counts.Players != 0 || counts.Gear != 0 {
		return fmt.Errorf("baseline run requires empty guilds, game_players and game_player_gear_history; restore a fresh armory seed")
	}
	return nil
}
func loadPublication(ctx context.Context, db database.Store, group uuid.UUID) (publicationData, error) {
	var data publicationData
	var err error
	if data.Guilds, err = db.BaselinePublishedGuilds(ctx, group); err != nil {
		return data, err
	}
	if data.Players, err = db.BaselinePublishedPlayers(ctx, group); err != nil {
		return data, err
	}
	if data.Gear, err = db.BaselinePublishedGear(ctx, group); err != nil {
		return data, err
	}
	if data.Loot, err = db.BaselineLoot(ctx, group); err != nil {
		return data, err
	}
	if data.Overview, err = db.BaselineOverview(ctx, group); err != nil {
		return data, err
	}
	if data.Speedruns, err = db.BaselineSpeedruns(ctx, group); err != nil {
		return data, err
	}
	counts, err := db.BaselineSharedArmoryCounts(ctx)
	if err != nil {
		return data, err
	}
	if counts.Guilds != int64(len(data.Guilds)) || counts.Players != int64(len(data.Players)) || counts.Gear != int64(len(data.Gear)) {
		return data, fmt.Errorf("shared armory contains rows outside selected parse; controlled fresh-armory fixture required")
	}
	return data, nil
}

func canonicalPublication(data publicationData, instances []database.LogInstancesGuild, keys map[uuid.UUID]string) (publicationOutput, map[uuid.UUID]string, error) {
	out := publicationOutput{SharedStateScope: armoryScope, Guilds: []map[string]any{}, Players: []map[string]any{}, Gear: []map[string]any{}, Loot: []map[string]any{}, Overview: []map[string]any{}, Speedruns: []map[string]any{}}
	guilds := make(map[uuid.UUID]string)
	realms := make(map[uuid.UUID]uuid.UUID)
	players := make(map[string]bool)
	for _, instance := range instances {
		realms[instance.ID] = instance.RealmID
	}
	instanceRef := func(row map[string]any, id uuid.UUID, field string) error {
		key, ok := keys[id]
		if !ok {
			return fmt.Errorf("missing publication instance %s", id)
		}
		row[field] = key
		return nil
	}
	guildRef := func(row map[string]any, id uuid.NullUUID) error {
		if !id.Valid {
			return nil
		}
		key, ok := guilds[id.UUID]
		if !ok {
			return fmt.Errorf("missing publication guild %s", id.UUID)
		}
		row["guild_id"] = key
		return nil
	}
	realmRef := func(instance, realm uuid.UUID) error {
		if expected, ok := realms[instance]; !ok || expected != realm {
			return fmt.Errorf("publication realm does not match instance")
		}
		return nil
	}
	for _, guild := range data.Guilds {
		key, err := identity("guild", guild.RealmID, guild.Name)
		if err != nil {
			return out, nil, err
		}
		if err := addReference(guilds, guild.ID, key); err != nil {
			return out, nil, err
		}
		row, err := project(guild, publicationFields["guilds"])
		if err != nil {
			return out, nil, err
		}
		row["id"] = key
		out.Guilds = append(out.Guilds, row)
	}
	for _, instance := range instances {
		if instance.GuildID.Valid {
			if _, ok := guilds[instance.GuildID.UUID]; !ok {
				return out, nil, fmt.Errorf("missing instance guild")
			}
		}
	}
	for _, player := range data.Players {
		if !player.UpdatedFromInstance.Valid {
			return out, nil, fmt.Errorf("player lacks parse provenance")
		}
		player.UpdatedAt = exactTime(player.UpdatedAt)
		row, err := project(player, publicationFields["game_players"])
		if err != nil {
			return out, nil, err
		}
		if err := instanceRef(row, player.UpdatedFromInstance.UUID, "updated_from_instance"); err != nil {
			return out, nil, err
		}
		if err := realmRef(player.UpdatedFromInstance.UUID, player.RealmID); err != nil {
			return out, nil, err
		}
		if err := guildRef(row, player.GuildID); err != nil {
			return out, nil, err
		}
		key, err := identity("player", player.RealmID, player.ID)
		if err != nil {
			return out, nil, err
		}
		if players[key] {
			return out, nil, fmt.Errorf("ambiguous player identity")
		}
		players[key] = true
		out.Players = append(out.Players, row)
	}
	for _, gear := range data.Gear {
		gear.EquippedAt = exactTime(gear.EquippedAt)
		row, err := project(gear, publicationFields["game_player_gear_history"])
		if err != nil {
			return out, nil, err
		}
		if err := instanceRef(row, gear.InstanceID, "instance_id"); err != nil {
			return out, nil, err
		}
		if err := realmRef(gear.InstanceID, gear.RealmID); err != nil {
			return out, nil, err
		}
		key, err := identity("player", gear.RealmID, gear.PlayerID)
		if err != nil {
			return out, nil, err
		}
		if !players[key] {
			return out, nil, fmt.Errorf("gear history references missing player")
		}
		out.Gear = append(out.Gear, row)
	}
	for _, loot := range data.Loot {
		loot.SourceTs = exactTime(loot.SourceTs)
		loot.ReceivedTs = exactTime(loot.ReceivedTs)
		row, err := project(loot, publicationFields["instance_loot"])
		if err != nil {
			return out, nil, err
		}
		if err := instanceRef(row, loot.InstanceID, "instance_id"); err != nil {
			return out, nil, err
		}
		if err := realmRef(loot.InstanceID, loot.RealmID); err != nil {
			return out, nil, err
		}
		delete(row, "id")
		key, err := identity("loot", row)
		if err != nil {
			return out, nil, err
		}
		row["id"] = key
		out.Loot = append(out.Loot, row)
	}
	// Loot has no unique natural key or references from other exports. Preserve
	// identical-row multiplicity with a stable occurrence suffix, never drop rows.
	slices.SortFunc(out.Loot, func(a, b map[string]any) int { return strings.Compare(a["id"].(string), b["id"].(string)) })
	previous := ""
	occurrence := 0
	for _, row := range out.Loot {
		key := row["id"].(string)
		if key == previous {
			occurrence++
		} else {
			occurrence = 0
		}
		previous = key
		row["id"] = key + "/" + strconv.Itoa(occurrence)
	}
	for _, metric := range data.Overview {
		row, err := project(metric, publicationFields["instance_overview_metrics"])
		if err != nil {
			return out, nil, err
		}
		if err := instanceRef(row, metric.InstanceID, "instance_id"); err != nil {
			return out, nil, err
		}
		out.Overview = append(out.Overview, row)
	}
	if len(out.Overview) != len(instances) {
		return out, nil, fmt.Errorf("missing mandatory overview metrics: expected %d, found %d", len(instances), len(out.Overview))
	}
	for _, speedrun := range data.Speedruns {
		speedrun.StartTime = exactTime(speedrun.StartTime)
		speedrun.CompletionTime = exactTime(speedrun.CompletionTime)
		speedrun.RankedStartTime = exactTime(speedrun.RankedStartTime)
		speedrun.RankedCompletionTime = exactTime(speedrun.RankedCompletionTime)
		speedrun.BossToBossStartTime = exactTime(speedrun.BossToBossStartTime)
		speedrun.BossToBossCompletionTime = exactTime(speedrun.BossToBossCompletionTime)
		row, err := project(speedrun, publicationFields["instance_speedruns"])
		if err != nil {
			return out, nil, err
		}
		if err := instanceRef(row, speedrun.InstanceID, "instance_id"); err != nil {
			return out, nil, err
		}
		if err := realmRef(speedrun.InstanceID, speedrun.RealmID); err != nil {
			return out, nil, err
		}
		if err := guildRef(row, speedrun.GuildID); err != nil {
			return out, nil, err
		}
		var proof any
		decoder := json.NewDecoder(bytes.NewReader(speedrun.Proof))
		decoder.UseNumber()
		if err := decoder.Decode(&proof); err != nil {
			return out, nil, fmt.Errorf("decode speedrun proof: %w", err)
		}
		var extra any
		if err := decoder.Decode(&extra); err != io.EOF {
			return out, nil, fmt.Errorf("speedrun proof must contain exactly one JSON value")
		}
		if proof == nil {
			return out, nil, fmt.Errorf("missing speedrun proof")
		}
		row["proof"] = proof
		out.Speedruns = append(out.Speedruns, row)
	}
	for _, table := range []struct {
		rows []map[string]any
		keys []string
	}{
		{out.Guilds, []string{"id"}}, {out.Players, []string{"realm_id", "id"}},
		{out.Gear, []string{"instance_id", "realm_id", "player_id"}},
		{out.Overview, []string{"instance_id"}}, {out.Speedruns, []string{"instance_id"}},
	} {
		if err := sortStructureRows(table.rows, table.keys); err != nil {
			return out, nil, err
		}
	}
	return out, guilds, nil
}
