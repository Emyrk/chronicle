// Package parseresult contains a data-only, pre-persistence projection of
// finalized combat-log data. It is not a complete instance insert payload.
package parseresult

import (
	"bytes"
	"fmt"
	"sort"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

// Input is a read-only view of a finalized 1.12a CC-addon instance. The caller
// owns Finalized and Events; Build copies every value it emits.
type Input struct {
	Format            database.LogFormat
	Name              string
	Finalized         *instances.FinalizedInstance
	Events            *encounterevents.Events
	Category          string
	DifficultyName    string
	MaxPlayers        int32
	DynamicDifficulty int32
	Capabilities      []string
	Units             *unitdb.Units
	Armory            *armory.Tracker
	IdentifyUnit      func(guid.GUID) identifier.Identity
}

// Result covers event streams and parser-derived core instance, overview,
// encounter fight/phase, raid snapshot and observed-unit fields. It still omits
// guild-participant rows, guild/armory writes, realm resolution,
// DB-assigned IDs, and write-time decisions. Boss and trash DPS ranking
// inputs are projected, but ranking-run side effects are not.
// Version 0 is the original unversioned projection, version 1 adds core fields,
// version 2 adds finalized loot observations, version 3 adds armory
// observations, version 4 adds participating player metadata, and version 5
// adds speedrun inputs; version 6 adds boss DPS ranking inputs, and version 7
// adds trash ranking inputs. No version is a complete persistence payload or
// full DB parity proof.
type Result struct {
	Format       database.LogFormat `json:"format"`
	Name         string             `json:"name"`
	RealmName    string             `json:"realm_name"`
	Versions     map[string]string  `json:"versions"`
	RecorderGUID string             `json:"recorder_guid"`
	RecorderName string             `json:"recorder_name"`
	Encounters   []Encounter        `json:"encounters"`
	Events       EventStreams       `json:"events"`
	// SchemaVersion identifies the transport DTO shape, not the parser version.
	SchemaVersion int               `json:"schema_version"`
	Core          CoreInstance      `json:"core"`
	Overview      Overview          `json:"overview"`
	RaidSnapshots []RaidSnapshot    `json:"raid_snapshots"`
	Units         []UnitMetadata    `json:"units"`
	Loot          []LootObservation `json:"loot"`
	Armory        ArmoryObservation `json:"armory"`
	Speedrun      *Speedrun         `json:"speedrun,omitempty"`
	BossRankings  BossRankingInput  `json:"boss_rankings"`
	TrashRankings TrashRankingInput `json:"trash_rankings"`
}

type Encounter struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	MapID                uint32    `json:"map_id"`
	KillType             string    `json:"kill_type"`
	Boss                 bool      `json:"boss"`
	Start                time.Time `json:"start"`
	End                  time.Time `json:"end"`
	RankingStartOffsetMs *int64    `json:"ranking_start_offset_ms"`
	RankingEndOffsetMs   *int64    `json:"ranking_end_offset_ms"`
	Remaining            []string  `json:"remaining"`
	Fights               []Fight   `json:"fights"`
	Phases               []Phase   `json:"phases"`
}

// EventStreams is the raw, uncompressed event data that Events.Insert writes.
// JSON encodes each []byte as base64; nil and empty streams remain distinct.
// Keep these fields in sync with encounterevents.Events.
type EventStreams encounterevents.Events

// Build does not finalize, query, write, or mutate parser state. Only the
// 1.12a CC-addon format is currently covered by this explicitly bounded seam.
func Build(in Input) (*Result, error) {
	if in.Format != database.LogFormat112aCcAddon {
		return nil, fmt.Errorf("unsupported parse-result format %q", in.Format)
	}
	if in.Finalized == nil || in.Events == nil {
		return nil, fmt.Errorf("finalized instance and events are required")
	}
	fin := in.Finalized
	out := &Result{
		Format:        in.Format,
		SchemaVersion: 7,
		Name:          in.Name,
		Versions:      make(map[string]string, len(fin.Versions)),
		Encounters:    make([]Encounter, 0, len(fin.Encounters)),
		Events: EventStreams{
			Damage:             bytes.Clone(in.Events.Damage),
			Healing:            bytes.Clone(in.Events.Healing),
			UnitPosition:       bytes.Clone(in.Events.UnitPosition),
			UnitResources:      bytes.Clone(in.Events.UnitResources),
			ResourceChange:     bytes.Clone(in.Events.ResourceChange),
			ExtraAttack:        bytes.Clone(in.Events.ExtraAttack),
			Slain:              bytes.Clone(in.Events.Slain),
			Resurrection:       bytes.Clone(in.Events.Resurrection),
			Cast:               bytes.Clone(in.Events.Cast),
			Aura:               bytes.Clone(in.Events.Aura),
			SpellGo:            bytes.Clone(in.Events.SpellGo),
			SpellStart:         bytes.Clone(in.Events.SpellStart),
			SpellFail:          bytes.Clone(in.Events.SpellFail),
			AuraCasts:          bytes.Clone(in.Events.AuraCasts),
			UnitClassification: bytes.Clone(in.Events.UnitClassification),
			CombatantInfo:      bytes.Clone(in.Events.CombatantInfo),
			Dispel:             bytes.Clone(in.Events.Dispel),
			Interrupt:          bytes.Clone(in.Events.Interrupt),
			Absorbed:           bytes.Clone(in.Events.Absorbed),
			CompanionStats:     bytes.Clone(in.Events.CompanionStats),
			Consume:            bytes.Clone(in.Events.Consume),
			RaidGroup:          bytes.Clone(in.Events.RaidGroup),
		},
	}
	if fin.Realm != nil {
		out.RealmName = fin.Realm.RealmName
	}
	if fin.RecorderGUID != nil {
		out.RecorderGUID = fin.RecorderGUID.String()
		if in.Units != nil {
			if unit, ok := in.Units.Get(*fin.RecorderGUID); ok {
				out.RecorderName = unit.Name
			}
		}
	}
	for key, value := range fin.Versions {
		out.Versions[key] = value
	}
	out.TrashRankings = projectTrashRankings(fin)
	out.BossRankings = projectBossRankings(fin)
	out.Speedrun = buildSpeedrun(fin, in.Capabilities)
	if err := buildCore(in, out); err != nil {
		return nil, err
	}
	out.Loot = buildLoot(fin.Loot)
	if in.Armory != nil {
		if in.Units == nil {
			return nil, fmt.Errorf("units required for armory level fallback")
		}
		var err error
		out.Armory, err = buildArmory(in.Armory.Snapshot(in.Units))
		if err != nil {
			return nil, fmt.Errorf("project armory: %w", err)
		}
	}
	for _, enc := range fin.Encounters {
		if len(enc.Combat.Hostiles) > 0 && in.IdentifyUnit == nil {
			return nil, fmt.Errorf("identify unit callback required for encounter fights")
		}
		item := Encounter{
			ID: enc.Combat.EncounterID.String(), Name: enc.Name,
			MapID: enc.Combat.MapID, KillType: string(enc.KillType), Boss: enc.Boss,
			Start: enc.Combat.Start, End: enc.Combat.End,
		}
		if enc.RankingWindow != nil {
			start := enc.RankingWindow.Start.Sub(enc.Combat.Start).Milliseconds()
			end := enc.RankingWindow.End.Sub(enc.Combat.Start).Milliseconds()
			item.RankingStartOffsetMs = &start
			item.RankingEndOffsetMs = &end
		}
		item.Remaining = make([]string, 0, len(enc.Remaining))
		for _, id := range enc.Remaining {
			item.Remaining = append(item.Remaining, id.String())
		}
		item.Fights = make([]Fight, 0, len(enc.Combat.Hostiles))
		for id, hostile := range enc.Combat.Hostiles {
			fight := Fight{GUID: id.String(), Boss: in.IdentifyUnit(id).Boss, Periods: make([]FightPeriod, 0, len(hostile.Activity))}
			for _, p := range hostile.Activity {
				entry, err := buildFightPeriod(p)
				if err != nil {
					return nil, fmt.Errorf("encounter %q fight %s: %w", enc.Name, id, err)
				}
				fight.Periods = append(fight.Periods, entry)
			}
			item.Fights = append(item.Fights, fight)
		}
		sort.Slice(item.Fights, func(i, j int) bool { return item.Fights[i].GUID < item.Fights[j].GUID })
		item.Phases = make([]Phase, 0, len(enc.Phases))
		for _, phase := range enc.Phases {
			item.Phases = append(item.Phases, Phase{ID: phase.ID.String(), Key: phase.Key, Name: phase.Name, Order: int32(phase.Order), StartOffsetMs: phase.StartOffsetMs, EndOffsetMs: phase.EndOffsetMs, KillType: string(phase.KillType)})
		}
		out.Encounters = append(out.Encounters, item)
	}
	return out, nil
}
