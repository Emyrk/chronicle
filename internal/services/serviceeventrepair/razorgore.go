package serviceeventrepair

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// RazorgoreRepairPlan is diagnostic evidence, not an executable mutation payload.
// Apply always reloads and reevaluates the source rows before using any changes.
type RazorgoreRepairPlan struct {
	InstanceID      uuid.UUID         `json:"instance_id"`
	RequiresReparse bool              `json:"requires_reparse"`
	Reason          string            `json:"reason"`
	Changes         []string          `json:"changes"`
	EvidenceHash    string            `json:"evidence_hash"`
	EncounterID     uuid.UUID         `json:"encounter_id,omitempty"`
	Outcome         database.KillType `json:"outcome,omitempty"`
	hostile         *database.LogInstanceEncounterHostile
	phase           *database.LogInstanceEncounterPhase
}

type razorgoreEvidence struct {
	Instance   database.LogInstance
	Encounters []database.LogInstanceEncounter
	Hostiles   []database.LogInstanceEncounterHostile
	Phases     []database.LogInstanceEncounterPhase
	Events     []database.LogInstanceEvent
	Rankings   []database.EncounterDpsRanking
	Speedruns  []database.InstanceSpeedrun
}

// EvaluateRazorgore supports pre-egg-threshold false kills when no other boss
// kill survives. Phase-two numerical repair requires event-time attribution that
// legacy streams cannot in general reconstruct (notably silent possession expiry).
func EvaluateRazorgore(ctx context.Context, db database.Store, instanceID uuid.UUID) (*RazorgoreRepairPlan, error) {
	var e razorgoreEvidence
	var err error
	if e.Instance, err = db.RazorgoreRepairInstance(ctx, instanceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Retention/deletion can race a queued repair. This is terminal
			// missing evidence, not a transient database error to retry forever.
			sum := sha256.Sum256([]byte("razorgore-false-kill-v1:missing:" + instanceID.String()))
			return &RazorgoreRepairPlan{InstanceID: instanceID, RequiresReparse: true,
				Reason:  "instance no longer exists or is not visible to the repair tenant",
				Changes: []string{}, EvidenceHash: hex.EncodeToString(sum[:])}, nil
		}
		return nil, fmt.Errorf("load instance: %w", err)
	}
	if e.Encounters, err = db.EncountersByInstanceID(ctx, instanceID); err != nil {
		return nil, err
	}
	if e.Hostiles, err = db.GetInstanceEncounterCharacterFights(ctx, instanceID); err != nil {
		return nil, err
	}
	if e.Phases, err = db.GetEncounterPhasesByInstanceID(ctx, instanceID); err != nil {
		return nil, err
	}
	if e.Events, err = db.RazorgoreRepairEvents(ctx, instanceID); err != nil {
		return nil, err
	}
	if e.Rankings, err = db.RazorgoreRepairRankings(ctx, instanceID); err != nil {
		return nil, err
	}
	if e.Speedruns, err = db.RazorgoreRepairSpeedruns(ctx, instanceID); err != nil {
		return nil, err
	}
	return evaluateRazorgoreEvidence(e)
}

// ApplyRazorgore must run in the caller's SERIALIZABLE transaction, under its
// instance operation lock. Never execute a deserialized plan's proposed changes.
func ApplyRazorgore(ctx context.Context, tx database.Store, plan *RazorgoreRepairPlan) error {
	if plan == nil || plan.InstanceID == uuid.Nil || plan.EvidenceHash == "" {
		return errors.New("missing Razorgore repair evidence")
	}
	fresh, err := EvaluateRazorgore(ctx, tx, plan.InstanceID)
	if err != nil {
		return err
	}
	if fresh.EvidenceHash != plan.EvidenceHash {
		return errors.New("razorgore evidence changed; reevaluate repair")
	}
	if fresh.RequiresReparse {
		return fmt.Errorf("razorgore requires reparse: %s", fresh.Reason)
	}
	if len(fresh.Changes) == 0 {
		return nil
	}
	if err := tx.RazorgoreRepairEncounter(ctx, database.RazorgoreRepairEncounterParams{InstanceID: fresh.InstanceID, EncounterID: fresh.EncounterID, KillType: fresh.Outcome}); err != nil {
		return err
	}
	if err := tx.RazorgoreRepairHostile(ctx, database.RazorgoreRepairHostileParams{EncounterID: fresh.EncounterID, ID: fresh.hostile.ID, Periods: fresh.hostile.Periods}); err != nil {
		return err
	}
	if err := tx.RazorgoreRepairPhase(ctx, database.RazorgoreRepairPhaseParams{EncounterID: fresh.EncounterID, ID: fresh.phase.ID, KillType: fresh.Outcome}); err != nil {
		return err
	}
	if err := tx.RazorgoreRepairDeleteRankings(ctx, database.RazorgoreRepairDeleteRankingsParams{InstanceID: fresh.InstanceID, EncounterID: uuid.NullUUID{UUID: fresh.EncounterID, Valid: true}}); err != nil {
		return err
	}
	return tx.RazorgoreRepairDeleteSpeedrun(ctx, fresh.InstanceID)
}

func evaluateRazorgoreEvidence(e razorgoreEvidence) (*RazorgoreRepairPlan, error) {
	// Database queries without ORDER BY must not make hashes depend on row order.
	slices.SortFunc(e.Encounters, func(a, b database.LogInstanceEncounter) int { return bytes.Compare(a.ID[:], b.ID[:]) })
	slices.SortFunc(e.Phases, func(a, b database.LogInstanceEncounterPhase) int { return bytes.Compare(a.ID[:], b.ID[:]) })
	slices.SortFunc(e.Hostiles, func(a, b database.LogInstanceEncounterHostile) int {
		if n := bytes.Compare(a.EncounterID[:], b.EncounterID[:]); n != 0 {
			return n
		}
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
	raw, err := json.Marshal(e)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(append([]byte("razorgore-false-kill-v1\x00"), raw...))
	p := &RazorgoreRepairPlan{InstanceID: e.Instance.ID, EvidenceHash: hex.EncodeToString(sum[:]), Changes: []string{}}
	skip := func(reason string) (*RazorgoreRepairPlan, error) {
		p.RequiresReparse = true
		p.Reason = reason
		p.Changes = []string{}
		return p, nil
	}
	if e.Instance.Name != "Blackwing Lair" || e.Instance.InvalidatedAt.Valid || slices.Contains(e.Instance.Capabilities, "server-side") {
		return skip("instance is not an active legacy Blackwing Lair source (authoritative encounter results require reparse)")
	}
	var enc *database.LogInstanceEncounter
	for i := range e.Encounters {
		c := &e.Encounters[i]
		if c.Name == "Razorgore the Untamed" {
			if enc != nil {
				return skip("multiple Razorgore pulls require full replay")
			}
			enc = c
		} else if c.Boss && (c.KillType == database.KillTypeClean || c.KillType == database.KillTypePartial) {
			return skip("other boss kills require speedrun proof and timing replay")
		}
	}
	if enc == nil {
		return skip("no Razorgore encounter")
	}
	p.EncounterID = enc.ID
	if !enc.Boss || enc.InvalidatedAt.Valid || !enc.StartTime.Valid || !enc.EndTime.Valid || !enc.EndTime.Time.After(enc.StartTime.Time) || len(enc.Remaining) != 0 {
		return skip("ambiguous encounter boundaries or remaining hostiles")
	}
	duration := enc.EndTime.Time.Sub(enc.StartTime.Time).Milliseconds()
	// PhaseDefinitions is emitted only for egg-tracked flavors. A full persisted
	// P1 proves the parser never crossed its flavor-specific threshold. Missing
	// phases cannot be inferred from a truncated egg stream or current realm flavor.
	for i := range e.Phases {
		if e.Phases[i].EncounterID == enc.ID {
			if p.phase != nil {
				return skip("phase two or multiple phases require numerical replay")
			}
			phase := e.Phases[i]
			p.phase = &phase
		}
	}
	if p.phase == nil || p.phase.Key != "razorgore_p1" || p.phase.PhaseOrder != 0 || p.phase.StartOffsetMs != 0 || p.phase.EndOffsetMs != duration {
		return skip("missing complete persisted phase-one evidence; egg-only inference requires reparse")
	}
	for i := range e.Hostiles {
		h := e.Hostiles[i]
		if h.EncounterID != enc.ID {
			continue
		}
		entry, _ := h.ID.GetEntry()
		if len(h.Periods) == 0 {
			return skip("missing hostile activity periods")
		}
		if entry == 12435 {
			if p.hostile != nil || !h.Boss || len(h.Periods) != 1 {
				return skip("ambiguous Razorgore activity periods")
			}
			p.hostile = &h
		} else if h.Boss {
			return skip("another boss participated in the Razorgore encounter")
		}
		last := h.Periods[len(h.Periods)-1]
		if last.EndState != database.EndStateSlain && last.EndState != database.EndStateReset {
			return skip("unresolved hostile periods require replay")
		}
	}
	if p.hostile == nil {
		return skip("missing Razorgore hostile period")
	}
	period := p.hostile.Periods[0]
	if period.Start == nil || period.End == nil || !period.Start.Timestamp.Equal(enc.StartTime.Time) || !period.End.Timestamp.Equal(enc.EndTime.Time) {
		return skip("boss period does not cover the complete encounter")
	}
	if period.EndState == database.EndStateReset && period.End.Reason != "razorgore_died_before_eggs_destroyed" {
		return skip("reset lacks explicit pre-threshold death provenance")
	}
	var slainBytes []byte
	for _, row := range e.Events {
		if row.Type == database.LogInstanceEventTypeSlain {
			slainBytes = row.Events
		}
	}
	deaths, err := razorgoreSlainEvents(slainBytes, enc.ID, enc.StartTime.Time, duration)
	if err != nil {
		return skip("incomplete slain evidence: " + err.Error())
	}
	bossDeaths := 0
	playerDeaths := 0
	for _, d := range deaths {
		if d.target == p.hostile.ID {
			if d.offset != duration {
				return skip("boss death is not the terminal encounter event")
			}
			bossDeaths++
		}
		if d.target.IsPlayer() {
			playerDeaths++
		}
	}
	if bossDeaths != 1 {
		return skip("requires exactly one explicit terminal Razorgore death")
	}
	p.Outcome = database.KillTypeReset
	if playerDeaths > 0 {
		p.Outcome = database.KillTypeWipe
	}
	// No boss kill remains: logparse deliberately persists no speedrun row at all.
	// Deleting that source also removes its proof and all raw/ranked timing claims.
	hasRankings := false
	for _, r := range e.Rankings {
		if !r.EncounterID.Valid && r.EncounterName != "Trash" {
			return skip("aggregate ranking source requires full replay")
		}
		if r.EncounterID.Valid && r.EncounterID.UUID == enc.ID {
			hasRankings = true
		}
	}
	if hasRankings {
		p.Changes = append(p.Changes, "delete Razorgore encounter ranking sources")
	}
	if enc.KillType != p.Outcome || enc.RankingStartOffsetMs.Valid || enc.RankingEndOffsetMs.Valid {
		p.Changes = append(p.Changes, "correct encounter outcome and clear ranking window")
	}
	if p.phase.KillType != p.Outcome {
		p.Changes = append(p.Changes, "correct phase-one outcome")
	}
	if period.EndState != database.EndStateReset || period.End.Reason != "razorgore_died_before_eggs_destroyed" {
		p.Changes = append(p.Changes, "correct Razorgore hostile end state")
	}
	if len(e.Speedruns) > 0 {
		p.Changes = append(p.Changes, "delete speedrun source and proof because no boss kills remain")
	}
	// Copy before changing the diagnostic reconstruction, never mutate hashed input.
	p.hostile.Periods = append(database.Periods(nil), p.hostile.Periods...)
	end := *period.End
	end.Reason = "razorgore_died_before_eggs_destroyed"
	p.hostile.Periods[0].End = &end
	p.hostile.Periods[0].EndState = database.EndStateReset
	p.Reason = "proven pre-threshold Razorgore death with no remaining boss kills"
	return p, nil
}
