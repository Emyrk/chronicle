package serviceeventrepair

import (
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"google.golang.org/protobuf/proto"
)

type razorgorePhaseDetail struct {
	EncounterID   uuid.UUID `json:"encounter_id"`
	StartOffsetMS int64     `json:"start_offset_ms"`
	EndOffsetMS   int64     `json:"end_offset_ms"`
	Reconstructed bool      `json:"reconstructed"`
}

// Reconstruction uses the saved log-group flavor, never current realm defaults.
// Existing phase rows remain authoritative and are validated by the normal paths.
func reconstructRazorgorePhases(e razorgoreEvidence, p *RazorgoreRepairPlan) (razorgoreEvidence, error) {
	e.Phases = append([]database.LogInstanceEncounterPhase(nil), e.Phases...)
	var details []razorgorePhaseDetail
	for _, c := range e.Encounters {
		if c.Name != "Razorgore the Untamed" {
			continue
		}
		found := false
		for _, ph := range e.Phases {
			if ph.EncounterID != c.ID {
				continue
			}
			found = true
			if ph.Key == "razorgore_p2" {
				details = append(details, razorgorePhaseDetail{EncounterID: c.ID, StartOffsetMS: ph.StartOffsetMs, EndOffsetMS: ph.EndOffsetMs})
			}
		}
		if found {
			continue
		}
		boundary, err := razorgoreEggBoundary(e, c)
		if err != nil {
			return e, fmt.Errorf("pull %s: %w", c.ID, err)
		}
		duration := c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds()
		for i, key := range []string{"razorgore_p1", "razorgore_p2"} {
			start, end, name := int64(0), boundary, "Adds"
			killType := database.KillTypeClean
			if i == 1 {
				start, end, name = boundary, duration, "Boss"
				killType = c.KillType
			}
			// Stable IDs keep reevaluation and the prepared-plan seal deterministic.
			id := uuid.NewSHA1(c.ID, []byte("event-repair-v1:"+key))
			ph := database.LogInstanceEncounterPhase{ID: id, EncounterID: c.ID, Key: key, Name: name, PhaseOrder: int32(i), StartOffsetMs: start, EndOffsetMs: end, KillType: killType}
			e.Phases = append(e.Phases, ph)
			p.reconstructedPhases = append(p.reconstructedPhases, database.InsertEncounterPhaseParams{ID: id, EncounterID: c.ID, Key: key, Name: name, PhaseOrder: int32(i), StartOffsetMs: start, EndOffsetMs: end, KillType: killType})
		}
		details = append(details, razorgorePhaseDetail{EncounterID: c.ID, StartOffsetMS: boundary, EndOffsetMS: duration, Reconstructed: true})
		p.Changes = append(p.Changes, "reconstruct Razorgore phases from stored egg casts "+c.ID.String())
	}
	if len(details) > 0 {
		if p.Details == nil {
			p.Details = map[string]any{}
		}
		p.Details["phases"] = details
	}
	return e, nil
}

func razorgoreEggBoundary(e razorgoreEvidence, c database.LogInstanceEncounter) (int64, error) {
	if !e.Group.Format.Valid || e.Group.Format.LogFormat != database.LogFormat112aCcAddon {
		return 0, errors.New("missing phases require complete addon spell_go evidence")
	}
	flavor := database.WoWFlavor{}
	for _, f := range e.Group.Flavor {
		flavor = append(flavor, database.FlavorTag(f))
	}
	threshold := creatures.RazorgoreEggThreshold(flavor)
	if threshold == 0 || (flavor.Has(database.FlavorNightmareOfUrsol) && flavor.Has(database.FlavorVanillaPlus)) {
		return 0, errors.New("missing phases have unsupported or ambiguous historical flavor")
	}
	if !c.Boss || c.InvalidatedAt.Valid || !c.StartTime.Valid || !c.EndTime.Valid || !c.EndTime.Time.After(c.StartTime.Time) {
		return 0, errors.New("missing phases have invalid pull boundaries")
	}
	duration := c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds()
	if c.EndTime.Time.Sub(c.StartTime.Time) != time.Duration(duration)*time.Millisecond {
		return 0, errors.New("sub-millisecond phase boundaries")
	}
	for _, other := range e.Encounters {
		if other.ID != c.ID && other.Name == c.Name && other.StartTime.Valid && other.EndTime.Valid && other.StartTime.Time.Before(c.EndTime.Time) && c.StartTime.Time.Before(other.EndTime.Time) {
			return 0, errors.New("overlapping Razorgore pulls cannot reconstruct egg coverage")
		}
	}
	var boss guid.GUID
	for _, h := range e.Hostiles {
		if h.EncounterID != c.ID || !h.Boss {
			continue
		}
		entry, _ := h.ID.GetEntry()
		if entry != 12435 || boss != 0 || len(h.Periods) != 1 || h.Periods[0].Start == nil || h.Periods[0].End == nil || !h.Periods[0].Start.Timestamp.Equal(c.StartTime.Time) || !h.Periods[0].End.Timestamp.Equal(c.EndTime.Time) {
			return 0, errors.New("ambiguous boss activity cannot establish egg coverage")
		}
		boss = h.ID
	}
	if boss == 0 {
		return 0, errors.New("missing boss identity for egg casts")
	}
	var stream []byte
	found := false
	for _, row := range e.Events {
		if row.Type != database.LogInstanceEventTypeSpellGo {
			continue
		}
		if found {
			return 0, errors.New("duplicate spell_go stream")
		}
		stream = row.Events
		found = true
	}
	if !found {
		return 0, errors.New("missing spell_go stream for egg reconstruction")
	}
	raw, err := razorgoreFrame(stream, c.ID, c.StartTime.Time)
	if err != nil {
		return 0, err
	}
	count := 0
	boundary := int64(0)
	previousIndex, previousOffset := int32(-1), int64(-1)
	for _, b := range raw {
		var cast chronicleproto.SpellGo
		if err := proto.Unmarshal(b, &cast); err != nil {
			return 0, err
		}
		m := cast.Meta
		if m == nil || m.IsSynthetic || m.Index <= previousIndex || m.OffsetMilli < previousOffset || m.OffsetMilli < 0 || m.OffsetMilli > duration {
			return 0, errors.New("invalid spell_go metadata for egg reconstruction")
		}
		previousIndex, previousOffset = m.Index, m.OffsetMilli
		if cast.SpellData == nil || cast.SpellData.Id != 19873 {
			continue
		}
		caster, err := guid.FromString(cast.Caster)
		if err != nil || caster != boss {
			return 0, errors.New("egg cast does not belong to proven Razorgore pull")
		}
		count++
		if count == threshold {
			boundary = m.OffsetMilli
		}
	}
	// A partial count does not prove P1, and excess casts may span an unobserved
	// reset. Only a complete unambiguous threshold crossing supplies missing P2.
	if count != threshold || boundary <= 0 || boundary >= duration {
		return 0, errors.New("incomplete or ambiguous egg threshold coverage")
	}
	return boundary, nil
}
