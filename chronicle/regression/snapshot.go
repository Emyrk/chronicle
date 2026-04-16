package regression

import (
	"encoding/json"
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
)

// Snapshot is a deterministic, JSON-serializable representation of parsed
// combat log instances. It is used to detect regressions across parser versions.
type Snapshot struct {
	Instances []InstanceSnapshot `json:"instances"`
}

type InstanceSnapshot struct {
	Name       string              `json:"name"`
	Encounters []EncounterSnapshot `json:"encounters"`
}

type EncounterSnapshot struct {
	Name       string            `json:"name"`
	Boss       bool              `json:"boss"`
	KillType   string            `json:"kill_type"`
	DurationMs int64             `json:"duration_ms"`
	Hostiles   []HostileSnapshot `json:"hostiles"`
}

type HostileSnapshot struct {
	GUID    string           `json:"guid"`
	Periods []PeriodSnapshot `json:"periods"`
}

type PeriodSnapshot struct {
	StartMs      int64  `json:"start_ms"`
	EndMs        int64  `json:"end_ms"`
	LastActiveMs int64  `json:"last_active_ms"`
	EndState     string `json:"end_state"`
}

// BuildSnapshot creates a deterministic Snapshot from finalized instances.
// instanceNames should be parallel to finalized (same length/order) and provides
// the instance name for each entry, since FinalizedInstance doesn't store it.
func BuildSnapshot(finalized []*instances.FinalizedInstance, instanceNames []string) *Snapshot {
	snap := &Snapshot{
		Instances: make([]InstanceSnapshot, 0, len(finalized)),
	}

	for idx, fin := range finalized {
		if fin == nil || len(fin.Encounters) == 0 {
			continue
		}

		name := ""
		if idx < len(instanceNames) {
			name = instanceNames[idx]
		}

		instSnap := InstanceSnapshot{
			Name:       name,
			Encounters: make([]EncounterSnapshot, 0, len(fin.Encounters)),
		}

		// Sort encounters by start time for determinism
		encs := make([]instances.Encounter, len(fin.Encounters))
		copy(encs, fin.Encounters)
		sort.Slice(encs, func(i, j int) bool {
			return encs[i].Combat.Start.Before(encs[j].Combat.Start)
		})

		for _, enc := range encs {
			encSnap := EncounterSnapshot{
				Name:       enc.Name,
				Boss:       enc.Boss,
				KillType:   string(enc.KillType),
				DurationMs: enc.Combat.End.Sub(enc.Combat.Start).Milliseconds(),
				Hostiles:   buildHostiles(enc),
			}
			instSnap.Encounters = append(instSnap.Encounters, encSnap)
		}

		snap.Instances = append(snap.Instances, instSnap)
	}

	return snap
}

func buildHostiles(enc instances.Encounter) []HostileSnapshot {
	hostiles := make([]HostileSnapshot, 0, len(enc.Combat.Hostiles))

	for gid, cf := range enc.Combat.Hostiles {
		hs := HostileSnapshot{
			GUID:    gid.String(),
			Periods: make([]PeriodSnapshot, 0, len(cf.Activity)),
		}
		for _, p := range cf.Activity {
			hs.Periods = append(hs.Periods, buildPeriod(p, enc))
		}
		hostiles = append(hostiles, hs)
	}

	// Sort by GUID for determinism
	sort.Slice(hostiles, func(i, j int) bool {
		return hostiles[i].GUID < hostiles[j].GUID
	})

	return hostiles
}

func buildPeriod(p period.Period, enc instances.Encounter) PeriodSnapshot {
	ps := PeriodSnapshot{
		EndState: string(p.EndState),
	}
	combatStart := enc.Combat.Start
	if p.Start != nil {
		ps.StartMs = p.Start.Timestamp.Date().Sub(combatStart).Milliseconds()
	}
	if p.End != nil {
		ps.EndMs = p.End.Timestamp.Date().Sub(combatStart).Milliseconds()
	}
	if p.LastActive != nil {
		ps.LastActiveMs = p.LastActive.Timestamp.Date().Sub(combatStart).Milliseconds()
	}
	return ps
}

// BuildSnapshotJSON builds a snapshot and marshals it to deterministic JSON.
func BuildSnapshotJSON(finalized []*instances.FinalizedInstance, instanceNames []string) ([]byte, error) {
	snap := BuildSnapshot(finalized, instanceNames)
	return json.MarshalIndent(snap, "", "  ")
}
