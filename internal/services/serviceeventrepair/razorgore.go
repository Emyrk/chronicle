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
// Only Evaluate creates an executable in-memory plan. JSON is diagnostic only.
type RazorgoreRepairPlan struct {
	Warnings            []string          `json:"warnings,omitempty"`
	Details             map[string]any    `json:"details,omitempty"`
	TenantID            uuid.UUID         `json:"tenant_id"`
	InstanceID          uuid.UUID         `json:"instance_id"`
	RequiresReparse     bool              `json:"requires_reparse"`
	Reason              string            `json:"reason"`
	Changes             []string          `json:"changes"`
	EvidenceHash        string            `json:"evidence_hash"`
	EncounterID         uuid.UUID         `json:"encounter_id,omitempty"`
	Outcome             database.KillType `json:"outcome,omitempty"`
	hostile             *database.LogInstanceEncounterHostile
	phase               *database.LogInstanceEncounterPhase
	numeric             *razorgoreNumericPlan
	multi               *razorgoreMultiPlan
	reconstructedPhases []database.InsertEncounterPhaseParams
	seal                [sha256.Size]byte
}

type razorgoreEvidence struct {
	Receipts        []database.EventRepairReceipt
	Group           database.WoWLogGroup
	MissingInstance bool
	Realm           database.WowServerRealm
	Server          database.WowServer
	Instance        database.LogInstance
	Encounters      []database.LogInstanceEncounter
	Hostiles        []database.LogInstanceEncounterHostile
	Phases          []database.LogInstanceEncounterPhase
	Events          []database.LogInstanceEvent
	Rankings        []database.EncounterDpsRanking
	Speedruns       []database.InstanceSpeedrun
}

// ErrStaleEvidence means the source snapshot changed after preview. Reconstruct
// a new preview outside the transaction rather than applying the old plan.
var ErrStaleEvidence = errors.New("razorgore evidence changed; reevaluate repair")

// EvaluateRazorgore loads and reconstructs a prepared plan outside the mutation
// transaction. Gzip/protobuf decoding and numerical replay happen only here.
// Supports proven direct-player phase-two metrics and pre-threshold false kills;
// general pet/possession replay is rejected rather than guessing classification.
func EvaluateRazorgore(ctx context.Context, db database.Store, instanceID uuid.UUID) (*RazorgoreRepairPlan, error) {
	e, err := loadRazorgoreEvidence(ctx, db, instanceID)
	if err != nil {
		return nil, err
	}
	p, err := evaluateRazorgoreEvidence(e)
	if err != nil {
		return nil, err
	}
	p.seal, err = razorgorePlanSeal(p)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// RevalidateRazorgore rereads only stored source rows and hashes their compressed
// event bytes. It performs no gzip decoding or numerical reconstruction. Call
// under the instance operation lock in the same SERIALIZABLE transaction as Apply.
func RevalidateRazorgore(ctx context.Context, tx database.Store, plan *RazorgoreRepairPlan) error {
	if err := validateRazorgorePlan(plan); err != nil {
		return err
	}
	e, err := loadRazorgoreEvidence(ctx, tx, plan.InstanceID)
	if err != nil {
		return err
	}
	hash, err := razorgoreEvidenceHash(e)
	if err != nil {
		return err
	}
	if hash != plan.EvidenceHash {
		return ErrStaleEvidence
	}
	return nil
}

// loadRazorgoreEvidence intentionally deals only in database rows. Retention or
// tenant identity loss is terminal missing evidence, not an endless retry error.
func loadRazorgoreEvidence(ctx context.Context, db database.Store, instanceID uuid.UUID) (razorgoreEvidence, error) {
	var e razorgoreEvidence
	var err error
	if e.Instance, err = db.RazorgoreRepairInstance(ctx, instanceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			e.MissingInstance = true
			e.Instance.ID = instanceID
			return e, nil
		}
		return e, fmt.Errorf("load instance: %w", err)
	}

	if e.Receipts, err = db.ListInstanceEventRepairReceipts(ctx, instanceID); err != nil {
		return e, err
	}
	if e.Instance.LogGroupID != uuid.Nil {
		if e.Group, err = db.RazorgoreRepairLogGroup(ctx, e.Instance.LogGroupID); err != nil {
			return e, err
		}
	}
	if e.Realm, err = db.GetWoWServerRealm(ctx, e.Instance.RealmID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return e, nil
		}
		return e, fmt.Errorf("load source realm: %w", err)
	}
	if e.Server, err = db.GetWoWServer(ctx, e.Realm.ServerID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return e, nil
		}
		return e, fmt.Errorf("load source server: %w", err)
	}
	if !e.Server.TenantID.Valid || e.Server.TenantID.UUID == uuid.Nil {
		return e, nil
	}
	if e.Encounters, err = db.EncountersByInstanceID(ctx, instanceID); err != nil {
		return e, err
	}
	if e.Hostiles, err = db.GetInstanceEncounterCharacterFights(ctx, instanceID); err != nil {
		return e, err
	}
	if e.Phases, err = db.GetEncounterPhasesByInstanceID(ctx, instanceID); err != nil {
		return e, err
	}
	if e.Events, err = db.RazorgoreRepairEvents(ctx, instanceID); err != nil {
		return e, err
	}
	if e.Rankings, err = db.RazorgoreRepairRankings(ctx, instanceID); err != nil {
		return e, err
	}
	if e.Speedruns, err = db.RazorgoreRepairSpeedruns(ctx, instanceID); err != nil {
		return e, err
	}
	return e, nil
}

// ApplyRazorgore writes only a sealed in-memory plan; it does not read or decode
// evidence. The caller MUST first Revalidate in its locked SERIALIZABLE transaction.
// Deserialized diagnostics and modified prepared payloads are never executable.
func ApplyRazorgore(ctx context.Context, tx database.Store, plan *RazorgoreRepairPlan) error {
	if err := validateRazorgorePlan(plan); err != nil {
		return err
	}
	fresh := plan
	if fresh.RequiresReparse {
		return fmt.Errorf("razorgore requires reparse: %s", fresh.Reason)
	}
	if len(fresh.Changes) == 0 {
		return nil
	}
	for _, phase := range fresh.reconstructedPhases {
		if err := tx.InsertEncounterPhase(ctx, phase); err != nil {
			return err
		}
	}
	if fresh.multi != nil {
		return applyRazorgoreMulti(ctx, tx, fresh.multi)
	}
	if fresh.numeric != nil {
		return applyRazorgoreNumeric(ctx, tx, fresh.numeric)
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

func razorgoreEvidenceHash(e razorgoreEvidence) (string, error) {
	// Sort copies so hashing never mutates a prepared preview or caller-owned rows.
	e.Receipts = slices.Clone(e.Receipts)
	slices.SortFunc(e.Receipts, func(a, b database.EventRepairReceipt) int {
		return bytes.Compare([]byte(a.Operation), []byte(b.Operation))
	})
	e.Encounters = slices.Clone(e.Encounters)
	e.Phases = slices.Clone(e.Phases)
	e.Hostiles = slices.Clone(e.Hostiles)
	e.Events = slices.Clone(e.Events)
	e.Rankings = slices.Clone(e.Rankings)
	e.Speedruns = slices.Clone(e.Speedruns)

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
	slices.SortFunc(e.Events, func(a, b database.LogInstanceEvent) int { return bytes.Compare([]byte(a.Type), []byte(b.Type)) })
	slices.SortFunc(e.Rankings, func(a, b database.EncounterDpsRanking) int { return bytes.Compare(a.ID[:], b.ID[:]) })
	slices.SortFunc(e.Speedruns, func(a, b database.InstanceSpeedrun) int { return bytes.Compare(a.InstanceID[:], b.InstanceID[:]) })
	raw, err := json.Marshal(e)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(append([]byte("razorgore-repair-v3\x00"), raw...))
	return hex.EncodeToString(sum[:]), nil
}

// The seal covers both public diagnostics and the private executable payload.
// It is never serialized, so a stored diagnostic cannot become an executable plan.
func razorgorePlanSeal(p *RazorgoreRepairPlan) ([sha256.Size]byte, error) {
	payload := struct {
		Plan                *RazorgoreRepairPlan
		Hostile             *database.LogInstanceEncounterHostile
		Phase               *database.LogInstanceEncounterPhase
		Numeric             *razorgoreNumericPlan
		Multi               *razorgoreMultiPlan
		ReconstructedPhases []database.InsertEncounterPhaseParams
	}{p, p.hostile, p.phase, p.numeric, p.multi, p.reconstructedPhases}
	raw, err := json.Marshal(payload)
	if err != nil {
		return [sha256.Size]byte{}, err
	}
	return sha256.Sum256(raw), nil
}

func validateRazorgorePlan(p *RazorgoreRepairPlan) error {
	if p == nil || p.InstanceID == uuid.Nil || p.EvidenceHash == "" || p.seal == ([sha256.Size]byte{}) {
		return errors.New("missing prepared Razorgore repair plan; evaluate outside the transaction")
	}
	sum, err := razorgorePlanSeal(p)
	if err != nil {
		return err
	}
	if sum != p.seal {
		return errors.New("prepared Razorgore repair plan was modified")
	}
	return nil
}

func evaluateRazorgoreEvidence(e razorgoreEvidence) (*RazorgoreRepairPlan, error) {
	hash, err := razorgoreEvidenceHash(e)
	if err != nil {
		return nil, err
	}
	p := &RazorgoreRepairPlan{
		InstanceID: e.Instance.ID, EvidenceHash: hash, Changes: []string{},
		Warnings: []string{},
		// Keep the version-1 diagnostic shape stable even without reconstructed
		// phases or omissions. Evaluators replace these with their typed slices.
		Details: map[string]any{"phases": []any{}, "omissions": []any{}},
	}
	skip := func(reason string) (*RazorgoreRepairPlan, error) {
		p.RequiresReparse = true
		p.Reason = reason
		p.Changes = []string{}
		return p, nil
	}

	if e.MissingInstance {
		return skip("instance no longer exists or is not visible to the repair tenant")
	}
	if !e.Server.TenantID.Valid || e.Server.TenantID.UUID == uuid.Nil || e.Realm.ID != e.Instance.RealmID || e.Server.ID != e.Realm.ServerID {
		return skip("source realm/server tenant identity is missing or inconsistent")
	}
	p.TenantID = e.Server.TenantID.UUID
	for _, receipt := range e.Receipts {
		if receipt.Operation == OperationRazorgore {
			return skip("this named repair script already has a permanent receipt for the instance")
		}
	}
	if e.Instance.Name != "Blackwing Lair" || e.Instance.InvalidatedAt.Valid || slices.Contains(e.Instance.Capabilities, "server-side") {
		return skip("instance is not an active legacy Blackwing Lair source (authoritative encounter results require reparse)")
	}
	// A distinct persisted ranking duration is the opt-out proxy for previously
	// processed instances, including manual reparses. Check every Razorgore pull
	// before replaying any stream, and leave malformed windows to existing checks.
	for _, c := range e.Encounters {
		if c.Name != "Razorgore the Untamed" || !c.StartTime.Valid || !c.EndTime.Valid || !c.EndTime.Time.After(c.StartTime.Time) || !c.RankingStartOffsetMs.Valid || !c.RankingEndOffsetMs.Valid {
			continue
		}
		start, end := c.RankingStartOffsetMs.Int64, c.RankingEndOffsetMs.Int64
		duration := c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds()
		if start >= 0 && end > start && end <= duration && end-start != duration {
			return skip("Razorgore already has distinct ranked duration; skipping previously processed instance")
		}
	}
	// Reconstruct only after the opt-out checks; EvidenceHash remains the hash of
	// the original stored evidence used by transactional revalidation.
	e, err = reconstructRazorgorePhases(e, p)
	if err != nil {
		return skip(err.Error())
	}
	if len(e.Encounters) > 1 && e.Group.Format.Valid {
		if err := evaluateRazorgoreMulti(e, p); err != nil {
			return skip(err.Error())
		}
		return p, nil
	}
	for _, phase := range e.Phases {
		if phase.Key == "razorgore_p2" {
			if err := evaluateRazorgoreNumeric(e, p); err != nil {
				return skip(err.Error())
			}
			return p, nil
		}
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
				return skip("original-log reparse required: phase-two numerical replay with verified complete event-time classification is not yet supported")
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
	if period.Start == nil || period.End == nil || period.Start.Timestamp.Before(enc.StartTime.Time) || period.Start.Timestamp.After(enc.EndTime.Time) || !period.End.Timestamp.Equal(enc.EndTime.Time) {
		return skip("boss period lies outside the encounter or lacks a terminal death")
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
