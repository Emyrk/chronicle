package main

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Field-level allowlists are deliberately explicit. This is NOT a full DB dump.
var instanceFields = []string{"id", "realm_id", "name", "capabilities", "recorder_name", "recorder_guid", "start_time", "end_time", "difficulty_name", "max_players", "dynamic_difficulty", "vehicle_control_intervals"}
var encounterFields = []string{"id", "instance_id", "name", "remaining", "boss", "start_time", "end_time", "kill_type", "map_id", "ranking_start_offset_ms", "ranking_end_offset_ms"}

var unsupportedTables = []string{
	"guilds", "game_players", "game_player_gear_history", "instance_loot",
	"instance_overview_metrics", "instance_speedruns",
}

type artifact struct {
	LogGroup          map[string]any      `json:"log_group"`
	Rankings          rankingOutput       `json:"ranking_parity"`
	Schema            string              `json:"schema"`
	Coverage          string              `json:"coverage"`
	Allowlist         map[string][]string `json:"allowlist"`
	UnsupportedTables []string            `json:"unsupported_tables"`
	Instances         []instanceOutput    `json:"instances"`
}
type instanceOutput struct {
	Structure  structureOutput                                  `json:"combat_structure"`
	Instance   map[string]any                                   `json:"instance"`
	Encounters []map[string]any                                 `json:"encounters"`
	Events     map[database.LogInstanceEventType][]eventSegment `json:"events"`
}

func export(ctx context.Context, db database.Store, logID uuid.UUID, generation int64, expectedInstances int) (*artifact, error) {
	if generation < 1 || expectedInstances < 1 {
		return nil, fmt.Errorf("positive generation and expected instance count required")
	}
	var result *artifact
	err := db.InTx(ctx, func(tx database.Store) error {
		published, err := tx.GetParsedLogGroupByID(ctx, logID)
		if err != nil {
			return fmt.Errorf("missing publication: %w", err)
		}
		visible, err := tx.IsParsedLogGroupVisible(ctx, logID)
		if err != nil {
			return err
		}
		if !visible || !published.FinalizedAt.Valid || published.ParseGeneration != generation {
			return fmt.Errorf("missing publication for expected generation %d", generation)
		}
		rows, err := tx.GetInstancesByLogGroupID(ctx, logID)
		if err != nil {
			return err
		}
		if len(rows) != expectedInstances {
			return fmt.Errorf("expected %d published instances, found %d", expectedInstances, len(rows))
		}
		keys, err := instanceKeys(rows)
		if err != nil {
			return err
		}
		result = &artifact{
			Schema: "chronicle-parser-baseline-v3", Coverage: "partial: log flavor, instances, encounters, combat structure, decoded events, rankings, synchronous memberships and referenced talents",
			Allowlist:         map[string][]string{"log_instances": instanceFields, "log_instance_encounters": encounterFields, "log_instance_events": {"instance_id", "type", "decoded_encounter_segments"}},
			UnsupportedTables: unsupportedTables, Instances: make([]instanceOutput, 0, len(rows)),
		}
		for table, fields := range map[string][]string{"encounter_dps_rankings": rankingFields, "talent_builds": talentFields, "parse_score_memberships": parseMembershipFields, "time_parse_clear_time_memberships": clearMembershipFields, "time_parse_boss_kill_memberships": bossMembershipFields} {
			result.Allowlist[table] = fields
		}
		for table, fields := range structureFields {
			result.Allowlist[table] = fields
		}
		result.Allowlist["wow_log_groups"] = logGroupFields
		group, err := tx.GetWoWLogGroupByID(ctx, logID)
		if err != nil {
			return err
		}
		result.LogGroup, err = logGroupValues(group.WoWLogGroup)
		if err != nil {
			return err
		}
		allEncounters := make(map[uuid.UUID]string)
		slices.SortFunc(rows, func(a, b database.LogInstancesGuild) int { return strings.Compare(keys[a.ID], keys[b.ID]) })
		for _, row := range rows {
			encounters, err := tx.EncountersByInstanceID(ctx, row.ID)
			if err != nil {
				return err
			}
			if len(encounters) == 0 {
				return fmt.Errorf("instance %s has no encounters", row.ID)
			}
			encounterIDs, err := encounterKeys(encounters, keys[row.ID])
			if err != nil {
				return err
			}
			for id, key := range encounterIDs {
				allEncounters[id] = key
			}
			slices.SortFunc(encounters, func(a, b database.LogInstanceEncounter) int {
				return strings.Compare(encounterIDs[a.ID], encounterIDs[b.ID])
			})
			out := instanceOutput{Instance: instanceValues(row, keys[row.ID]), Encounters: make([]map[string]any, 0, len(encounters)), Events: make(map[database.LogInstanceEventType][]eventSegment)}
			for _, encounter := range encounters {
				out.Encounters = append(out.Encounters, encounterValues(encounter, encounterIDs[encounter.ID], keys[row.ID]))
			}
			for _, kind := range database.AllLogInstanceEventTypeValues() {
				stream, err := tx.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: row.ID, Type: string(kind)})
				if err != nil {
					return fmt.Errorf("missing stream %s for %s: %w", kind, row.ID, err)
				}
				decoded, err := decodeEvents(stream.Events, kind, encounterIDs)
				if err != nil {
					return fmt.Errorf("decode %s for %s: %w", kind, row.ID, err)
				}
				out.Events[kind] = decoded
			}
			structure, err := loadStructure(ctx, tx, row.ID)
			if err != nil {
				return err
			}
			out.Structure, err = canonicalStructure(structure, row.ID, keys[row.ID], encounterIDs)
			if err != nil {
				return err
			}
			result.Instances = append(result.Instances, out)
		}
		data, err := loadRankings(ctx, tx, logID)
		if err != nil {
			return err
		}
		result.Rankings, err = canonicalRankings(data, logID, rows, keys, allEncounters)
		return err
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	return result, err
}

func exactTime(t pgtype.Timestamptz) pgtype.Timestamptz {
	// UTC changes only representation, never precision or the represented instant.
	t.Time = t.Time.UTC()
	return t
}
func instanceValues(r database.LogInstancesGuild, key string) map[string]any {
	return map[string]any{"id": key, "realm_id": r.RealmID, "name": r.Name, "capabilities": r.Capabilities, "recorder_name": r.RecorderName, "recorder_guid": r.RecorderGuid, "start_time": exactTime(r.StartTime), "end_time": exactTime(r.EndTime), "difficulty_name": r.DifficultyName, "max_players": r.MaxPlayers, "dynamic_difficulty": r.DynamicDifficulty, "vehicle_control_intervals": r.VehicleControlIntervals}
}
func encounterValues(r database.LogInstanceEncounter, key, parent string) map[string]any {
	return map[string]any{"id": key, "instance_id": parent, "name": r.Name, "remaining": r.Remaining, "boss": r.Boss, "start_time": exactTime(r.StartTime), "end_time": exactTime(r.EndTime), "kill_type": r.KillType, "map_id": r.MapID, "ranking_start_offset_ms": r.RankingStartOffsetMs, "ranking_end_offset_ms": r.RankingEndOffsetMs}
}

func instanceKeys(rows []database.LogInstancesGuild) (map[uuid.UUID]string, error) {
	identities := make(map[uuid.UUID]string, len(rows))
	for _, row := range rows {
		if !row.StartTime.Valid || !row.EndTime.Valid {
			return nil, fmt.Errorf("instance has missing semantic time")
		}
		data, err := json.Marshal([]any{row.RealmID, row.Name, exactTime(row.StartTime), exactTime(row.EndTime)})
		if err != nil {
			return nil, err
		}
		identities[row.ID] = string(data)
	}
	if len(identities) != len(rows) {
		return nil, fmt.Errorf("duplicate instance IDs")
	}
	return canonicalKeys(identities, "instance")
}
func encounterKeys(rows []database.LogInstanceEncounter, parent string) (map[uuid.UUID]string, error) {
	identities := make(map[uuid.UUID]string, len(rows))
	for _, row := range rows {
		if !row.StartTime.Valid || !row.EndTime.Valid {
			return nil, fmt.Errorf("encounter has missing semantic time")
		}
		data, err := json.Marshal([]any{row.Name, row.MapID, row.Boss, exactTime(row.StartTime), exactTime(row.EndTime)})
		if err != nil {
			return nil, err
		}
		identities[row.ID] = string(data)
	}
	if len(identities) != len(rows) {
		return nil, fmt.Errorf("duplicate encounter IDs")
	}
	return canonicalKeys(identities, parent+"/encounter")
}
func canonicalKeys(identities map[uuid.UUID]string, prefix string) (map[uuid.UUID]string, error) {
	ordered := make([]string, 0, len(identities))
	seen := make(map[string]bool)
	for _, identity := range identities {
		if seen[identity] {
			return nil, fmt.Errorf("ambiguous %s semantic identity", prefix)
		}
		seen[identity] = true
		ordered = append(ordered, identity)
	}
	slices.Sort(ordered)
	result := make(map[uuid.UUID]string, len(identities))
	for id, identity := range identities {
		index, _ := slices.BinarySearch(ordered, identity)
		result[id] = prefix + "/" + strconv.Itoa(index)
	}
	return result, nil
}
