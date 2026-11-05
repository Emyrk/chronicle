// Package parseresult contains a data-only, pre-persistence projection of
// finalized combat-log data. It is not a complete instance insert payload.
package parseresult

import (
	"bytes"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/database"
)

// Input is a read-only view of a finalized 1.12a CC-addon instance. The caller
// owns Finalized and Events; Build copies every value it emits.
type Input struct {
	Format    database.LogFormat
	Name      string
	Finalized *instances.FinalizedInstance
	Events    *encounterevents.Events
}

// Result covers only event streams and selected instance/encounter metadata.
// It omits units, encounter fights/phases, guilds, loot, participants, rankings,
// overview metrics, raid groups, vehicle metadata, realm resolution, and all
// DB-assigned IDs and write-time decisions. It cannot be used for persistence
// or DB parity without those additional projections.
type Result struct {
	Format       database.LogFormat `json:"format"`
	Name         string             `json:"name"`
	RealmName    string             `json:"realm_name"`
	Versions     map[string]string  `json:"versions"`
	RecorderGUID string             `json:"recorder_guid"`
	Encounters   []Encounter        `json:"encounters"`
	Events       EventStreams       `json:"events"`
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
		Format:     in.Format,
		Name:       in.Name,
		Versions:   make(map[string]string, len(fin.Versions)),
		Encounters: make([]Encounter, 0, len(fin.Encounters)),
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
	}
	for key, value := range fin.Versions {
		out.Versions[key] = value
	}
	for _, enc := range fin.Encounters {
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
		out.Encounters = append(out.Encounters, item)
	}
	return out, nil
}
