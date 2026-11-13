package main

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

var structureFields = map[string][]string{
	"log_instance_units":                strings.Fields("instance_id unit_guid name entry owner_guid"),
	"log_instance_players":              strings.Fields("instance_id unit_guid name level class race faction guild_id"),
	"log_instance_encounter_hostiles":   strings.Fields("encounter_id id periods boss"),
	"log_instance_encounter_phases":     strings.Fields("id encounter_id key name phase_order start_offset_ms end_offset_ms kill_type"),
	"log_instance_raid_group_snapshots": strings.Fields("id instance_id encounter_id snapshot_type observed_at composition"),
}
var logGroupFields = strings.Fields("id log_type format flavor")

type structureData struct {
	Units     []database.LogInstanceUnit
	Players   []database.LogInstancePlayer
	Hostiles  []database.LogInstanceEncounterHostile
	Phases    []database.LogInstanceEncounterPhase
	Snapshots []database.InstanceRaidGroupSnapshotsRow
	Guilds    []database.Guild
}

type structureOutput struct {
	Units     []map[string]any `json:"log_instance_units"`
	Players   []map[string]any `json:"log_instance_players"`
	Hostiles  []map[string]any `json:"log_instance_encounter_hostiles"`
	Phases    []map[string]any `json:"log_instance_encounter_phases"`
	Snapshots []map[string]any `json:"log_instance_raid_group_snapshots"`
}

func loadStructure(ctx context.Context, db database.Store, instance uuid.UUID) (structureData, error) {
	var data structureData
	var err error
	if data.Units, err = db.InstanceUnitsByInstanceID(ctx, instance); err != nil {
		return data, err
	}
	if data.Players, err = db.InstancePlayersByInstanceID(ctx, instance); err != nil {
		return data, err
	}
	if data.Hostiles, err = db.GetInstanceEncounterCharacterFights(ctx, instance); err != nil {
		return data, err
	}
	if data.Phases, err = db.GetEncounterPhasesByInstanceID(ctx, instance); err != nil {
		return data, err
	}
	if data.Snapshots, err = db.InstanceRaidGroupSnapshots(ctx, instance); err != nil {
		return data, err
	}
	data.Guilds, err = db.BaselineInstancePlayerGuilds(ctx, instance)
	return data, err
}

func logGroupValues(group database.WoWLogGroup) (map[string]any, error) {
	row, err := project(group, logGroupFields)
	if err != nil {
		return nil, err
	}
	row["id"] = "log-group"
	return row, nil
}

func canonicalStructure(data structureData, instance uuid.UUID, parent string, encounters map[uuid.UUID]string) (structureOutput, error) {
	out := structureOutput{Units: []map[string]any{}, Players: []map[string]any{}, Hostiles: []map[string]any{}, Phases: []map[string]any{}, Snapshots: []map[string]any{}}
	guilds := make(map[uuid.UUID]string)
	for _, guild := range data.Guilds {
		key, err := identity("guild", guild.RealmID, guild.Name)
		if err != nil {
			return out, err
		}
		if err := addReference(guilds, guild.ID, key); err != nil {
			return out, err
		}
	}
	instanceRef := func(row map[string]any, id uuid.UUID) error {
		if id != instance {
			return fmt.Errorf("combat structure instance outside scope")
		}
		row["instance_id"] = parent
		return nil
	}
	encounterRef := func(row map[string]any, id uuid.UUID) error {
		key, ok := encounters[id]
		if !ok || !strings.HasPrefix(key, parent+"/encounter/") {
			return fmt.Errorf("combat structure encounter outside scope")
		}
		row["encounter_id"] = key
		return nil
	}
	for _, unit := range data.Units {
		row, err := project(unit, structureFields["log_instance_units"])
		if err != nil {
			return out, err
		}
		if err := instanceRef(row, unit.InstanceID); err != nil {
			return out, err
		}
		out.Units = append(out.Units, row)
	}
	for _, player := range data.Players {
		row, err := project(player, structureFields["log_instance_players"])
		if err != nil {
			return out, err
		}
		if err := instanceRef(row, player.InstanceID); err != nil {
			return out, err
		}
		if player.GuildID.Valid {
			key, ok := guilds[player.GuildID.UUID]
			if !ok {
				return out, fmt.Errorf("missing player guild %s", player.GuildID.UUID)
			}
			row["guild_id"] = key
		}
		out.Players = append(out.Players, row)
	}
	for _, hostile := range data.Hostiles {
		// Activity periods and embedded event evidence are ordered semantic data.
		// Project preserves every value, including nanosecond timestamps and bigint
		// JSON message fields. Never sort or trim the nested periods/messages.
		row, err := project(hostile, structureFields["log_instance_encounter_hostiles"])
		if err != nil {
			return out, err
		}
		if err := encounterRef(row, hostile.EncounterID); err != nil {
			return out, err
		}
		out.Hostiles = append(out.Hostiles, row)
	}
	for _, phase := range data.Phases {
		row, err := project(phase, structureFields["log_instance_encounter_phases"])
		if err != nil {
			return out, err
		}
		if err := encounterRef(row, phase.EncounterID); err != nil {
			return out, err
		}
		row["id"], err = identity("phase", row["encounter_id"], phase.Key)
		if err != nil {
			return out, err
		}
		out.Phases = append(out.Phases, row)
	}
	for _, snapshot := range data.Snapshots {
		snapshot.ObservedAt = exactTime(snapshot.ObservedAt)
		row, err := project(snapshot, structureFields["log_instance_raid_group_snapshots"])
		if err != nil {
			return out, err
		}
		if err := instanceRef(row, snapshot.InstanceID); err != nil {
			return out, err
		}
		if snapshot.EncounterID.Valid {
			if err := encounterRef(row, snapshot.EncounterID.UUID); err != nil {
				return out, err
			}
		}
		row["id"], err = identity("raid-snapshot", parent, row["encounter_id"], snapshot.SnapshotType, row["observed_at"])
		if err != nil {
			return out, err
		}
		out.Snapshots = append(out.Snapshots, row)
	}
	for _, table := range []struct {
		rows []map[string]any
		keys []string
	}{
		{out.Units, []string{"unit_guid"}}, {out.Players, []string{"unit_guid"}},
		{out.Hostiles, []string{"encounter_id", "id"}}, {out.Phases, []string{"id"}}, {out.Snapshots, []string{"id"}},
	} {
		if err := sortStructureRows(table.rows, table.keys); err != nil {
			return out, err
		}
	}
	return out, nil
}

func sortStructureRows(rows []map[string]any, fields []string) error {
	type keyedRow struct {
		key string
		row map[string]any
	}
	keyed := make([]keyedRow, 0, len(rows))
	for _, row := range rows {
		values := make([]any, 0, len(fields))
		for _, field := range fields {
			values = append(values, row[field])
		}
		key, err := identity("", values...)
		if err != nil {
			return err
		}
		keyed = append(keyed, keyedRow{key, row})
	}
	slices.SortFunc(keyed, func(a, b keyedRow) int { return strings.Compare(a.key, b.key) })
	for i, item := range keyed {
		if i > 0 && keyed[i-1].key == item.key {
			return fmt.Errorf("ambiguous combat structure identity %s", item.key)
		}
		rows[i] = item.row
	}
	return nil
}
