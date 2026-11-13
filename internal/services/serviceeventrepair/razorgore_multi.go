package serviceeventrepair

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type razorgoreFalseMutation struct {
	InstanceID  uuid.UUID
	EncounterID uuid.UUID
	Outcome     database.KillType
	Hostile     *database.LogInstanceEncounterHostile
	Phase       *database.LogInstanceEncounterPhase
}
type razorgoreMultiPlan struct {
	InstanceID     uuid.UUID
	FalseKills     []razorgoreFalseMutation
	Numerical      []*razorgoreNumericPlan
	DeleteRankings []uuid.UUID
	Speedrun       *database.RazorgoreRepairSpeedrunProofParams
}

// Multi-pull orchestration never changes original encounter boundaries or blobs.
// Non-Razorgore pulls retain their existing outcomes, metrics and proof entries.
func evaluateRazorgoreMulti(e razorgoreEvidence, p *RazorgoreRepairPlan) error {
	m := &razorgoreMultiPlan{InstanceID: e.Instance.ID}
	var trueKills []rankings.KillRecord
	var falseKills []rankings.KillRecord
	pulls := 0
	for _, c := range e.Encounters {
		if c.Name != "Razorgore the Untamed" {
			continue
		}
		pulls++
		if !c.Boss || c.InvalidatedAt.Valid || !c.StartTime.Valid || !c.EndTime.Valid || !c.EndTime.Time.After(c.StartTime.Time) {
			return errors.New("invalid Razorgore pull boundaries")
		}
		sub := e
		sub.Encounters = []database.LogInstanceEncounter{c}
		sub.Phases = nil
		sub.Hostiles = nil
		sub.Rankings = nil
		sub.Speedruns = nil
		for _, ph := range e.Phases {
			if ph.EncounterID == c.ID {
				sub.Phases = append(sub.Phases, ph)
			}
		}
		for _, h := range e.Hostiles {
			if h.EncounterID == c.ID {
				sub.Hostiles = append(sub.Hostiles, h)
			}
		}
		for _, r := range e.Rankings {
			if r.EncounterID.Valid && r.EncounterID.UUID == c.ID {
				sub.Rankings = append(sub.Rankings, r)
			}
		}
		slices.SortFunc(sub.Phases, func(a, b database.LogInstanceEncounterPhase) int { return int(a.PhaseOrder - b.PhaseOrder) })
		duration := c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds()
		if len(sub.Phases) == 0 {
			return errors.New("missing persisted Razorgore phases; original-log reparse required")
		}
		if len(sub.Phases) == 1 && sub.Phases[0].Key == "razorgore_p1" {
			if c.KillType == database.KillTypeClean || c.KillType == database.KillTypePartial {
				fix, err := evaluateRazorgoreEvidence(sub)
				if err != nil {
					return err
				}
				if fix.RequiresReparse {
					return fmt.Errorf("false-kill evidence: %s", fix.Reason)
				}
				m.FalseKills = append(m.FalseKills, razorgoreFalseMutation{InstanceID: fix.InstanceID, EncounterID: fix.EncounterID, Outcome: fix.Outcome, Hostile: fix.hostile, Phase: fix.phase})
				falseKills = append(falseKills, rankings.KillRecord{EntryID: 12435, GUID: fix.hostile.ID, Timestamp: c.EndTime.Time})
				p.Changes = append(p.Changes, "correct pre-threshold false kill "+c.ID.String())
			} else if c.KillType != database.KillTypeWipe && c.KillType != database.KillTypeReset {
				return errors.New("unresolved phase-one outcome")
			}
			if (c.KillType == database.KillTypeWipe || c.KillType == database.KillTypeReset) && len(sub.Rankings) > 0 {
				m.DeleteRankings = append(m.DeleteRankings, c.ID)
				p.Changes = append(p.Changes, "remove phase-one non-kill source metrics "+c.ID.String())
			}
			continue
		}
		if len(sub.Phases) != 2 || sub.Phases[0].PhaseOrder != 0 || sub.Phases[1].PhaseOrder != 1 || sub.Phases[0].Key != "razorgore_p1" || sub.Phases[1].Key != "razorgore_p2" || sub.Phases[0].StartOffsetMs != 0 || sub.Phases[0].EndOffsetMs != sub.Phases[1].StartOffsetMs || sub.Phases[1].EndOffsetMs != duration || sub.Phases[1].StartOffsetMs <= 0 || sub.Phases[1].StartOffsetMs >= duration {
			return errors.New("incomplete contiguous phase-two evidence")
		}
		window := &encounter.RankingWindow{Start: c.StartTime.Time.Add(time.Duration(sub.Phases[1].StartOffsetMs) * time.Millisecond), End: c.EndTime.Time}
		n := &razorgoreNumericPlan{Window: database.RazorgoreRepairRankingWindowParams{EncounterID: c.ID, InstanceID: c.InstanceID, StartMs: pgtype.Int8{Int64: sub.Phases[1].StartOffsetMs, Valid: true}, EndMs: pgtype.Int8{Int64: duration, Valid: true}}}
		if c.KillType == database.KillTypeWipe || c.KillType == database.KillTypeReset {
			if len(sub.Rankings) > 0 {
				m.DeleteRankings = append(m.DeleteRankings, c.ID)
				p.Changes = append(p.Changes, "remove non-kill source metrics "+c.ID.String())
			}
		} else if c.KillType == database.KillTypeClean {
			boss, err := provenRazorgoreDeath(sub, c)
			if err != nil {
				return err
			}
			trueKills = append(trueKills, rankings.KillRecord{EntryID: 12435, GUID: boss, Timestamp: c.EndTime.Time})
			stats, life, err := replayRazorgoreClassified(e, c, window, e.Group.Format.LogFormat)
			if err != nil {
				return fmt.Errorf("pull %s: %w", c.ID, err)
			}
			rolesInput := map[guid.GUID]wowspec.PlayerMetrics{}
			for _, row := range sub.Rankings {
				g, err := guid.FromString(row.PlayerGuid)
				if err != nil {
					return err
				}
				v := stats.Units[g]
				if v == nil {
					return errors.New("source player missing reconstructed metrics")
				}
				rolesInput[g] = wowspec.PlayerMetrics{DamageDone: v.RankedDamageDone, DamageTaken: v.DamageTaken, HealingDone: v.HealingDone + v.HealingAbsorbed, Class: row.PlayerClass, Spec: row.PlayerSpec}
			}
			roles := wowspec.InferRoles(rolesInput)
			for _, row := range sub.Rankings {
				g, _ := guid.FromString(row.PlayerGuid)
				v := stats.Units[g]
				alive := rankings.PlayerSurvivability{AlivePercentage: 100}
				if a, ok := life.Players[g]; ok {
					alive = a
				}
				secs := window.End.Sub(window.Start).Seconds()
				update := database.RazorgoreRepairMetricsParams{ID: row.ID, InstanceID: row.InstanceID, EncounterID: row.EncounterID, DamageDone: v.RankedDamageDone, UnrankedDamageDone: v.UnrankedDamageDone, HealingDone: v.HealingDone, AbsorbedDone: v.HealingAbsorbed, DurationSecs: secs, Dps: float64(v.RankedDamageDone) / secs, Hps: float64(v.HealingDone+v.HealingAbsorbed) / secs, PlayerRole: roles[g], PlayerDeaths: pgtype.Int4{Int32: alive.Deaths, Valid: true}, AlivePercentage: pgtype.Float8{Float64: alive.AlivePercentage, Valid: true}}
				if !razorgoreMetricsEqual(row, update) {
					n.Metrics = append(n.Metrics, update)
				}
			}
		} else {
			return errors.New("ambiguous phase-two outcome")
		}
		if c.RankingStartOffsetMs != n.Window.StartMs || c.RankingEndOffsetMs != n.Window.EndMs || len(n.Metrics) > 0 {
			m.Numerical = append(m.Numerical, n)
			p.Changes = append(p.Changes, "repair phase-two window and source metrics "+c.ID.String())
		}
	}
	if pulls == 0 {
		return errors.New("no Razorgore pulls")
	}
	if len(trueKills) == 0 {
		return errors.New("multi-pull repair without a proven surviving kill requires proof replay")
	}
	if err := repairRazorgoreMultiProof(e, m, trueKills, falseKills); err != nil {
		return err
	}
	if m.Speedrun != nil {
		p.Changes = append(p.Changes, "correct Razorgore speedrun proof using original full-pull timing")
	}
	p.multi = m
	p.Reason = "multiple Razorgore pulls validated; phase-two attribution replayed and full-encounter proof retained"
	return nil
}

func provenRazorgoreDeath(e razorgoreEvidence, c database.LogInstanceEncounter) (guid.GUID, error) {
	var boss guid.GUID
	for _, h := range e.Hostiles {
		entry, _ := h.ID.GetEntry()
		if !h.Boss {
			continue
		}
		if entry != 12435 || boss != 0 || len(h.Periods) != 1 {
			return 0, errors.New("ambiguous boss activity")
		}
		period := h.Periods[0]
		if period.End == nil || period.EndState != database.EndStateSlain || !period.End.Timestamp.Equal(c.EndTime.Time) {
			return 0, errors.New("boss death not at full encounter end")
		}
		boss = h.ID
	}
	if boss == 0 {
		return 0, errors.New("missing boss period")
	}
	count := 0
	for _, row := range e.Events {
		if row.Type != database.LogInstanceEventTypeSlain {
			continue
		}
		deaths, err := razorgoreSlainEvents(row.Events, c.ID, c.StartTime.Time, c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds())
		if err != nil {
			return 0, err
		}
		for _, d := range deaths {
			if d.target == boss {
				if d.offset != c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds() {
					return 0, errors.New("nonterminal boss death")
				}
				count++
			}
		}
	}
	if count != 1 {
		return 0, errors.New("requires one explicit terminal boss death")
	}
	return boss, nil
}

func repairRazorgoreMultiProof(e razorgoreEvidence, m *razorgoreMultiPlan, kills, falseKills []rankings.KillRecord) error {
	if len(e.Speedruns) != 1 || e.Instance.MixedDifficulty {
		return errors.New("missing or ambiguous speedrun source")
	}
	s := e.Speedruns[0]
	var proof rankings.SpeedrunProofPayload
	if err := json.Unmarshal(s.Proof, &proof); err != nil {
		return err
	}
	slices.SortFunc(kills, func(a, b rankings.KillRecord) int { return a.Timestamp.Compare(b.Timestamp) })
	earliest := e.Encounters[0].StartTime.Time
	for _, c := range e.Encounters {
		if c.StartTime.Time.Before(earliest) {
			earliest = c.StartTime.Time
		}
	}
	if !s.StartTime.Valid || !s.StartTime.Time.Equal(earliest) || !s.RankedStartTime.Valid || !s.RankedStartTime.Time.Equal(s.StartTime.Time) || !s.BossToBossStartTime.Valid {
		return errors.New("speedrun original start boundaries not independently supported")
	}

	required := map[uint32]bool{12435: false, 13020: false, 12017: false, 11983: false, 14601: false, 11981: false, 14020: false, 11583: false}
	seen := map[uint32]bool{}
	found := false
	qualified := true
	var completion time.Time
	for i := range proof.Proof {
		pr := &proof.Proof[i]
		if len(pr.Requirement.EntryIDs) != 1 || pr.Requirement.Count != 1 || pr.Requirement.Category != rankings.SpeedrunCategoryBosses {
			return errors.New("unsupported BWL proof requirement")
		}
		entry := pr.Requirement.EntryIDs[0]
		if seen[entry] {
			return errors.New("duplicate BWL proof requirement")
		}
		seen[entry] = true
		if _, ok := required[entry]; ok {
			required[entry] = true
		} else if entry != 65148 && entry != 14401 {
			return errors.New("unknown BWL proof requirement")
		}
		if entry != 12435 && (pr.Satisfied != (len(pr.Kills) >= 1) || len(pr.Kills) > 1) {
			return errors.New("inconsistent unchanged BWL proof requirement")
		}
		isRazor := slices.Contains(pr.Requirement.EntryIDs, uint32(12435))
		if isRazor {
			if found || len(pr.Requirement.EntryIDs) != 1 || pr.Requirement.Count != 1 {
				return errors.New("ambiguous Razorgore speedrun requirement")
			}
			found = true
			for _, old := range pr.Kills {
				known := false
				for _, k := range append(append([]rankings.KillRecord{}, kills...), falseKills...) {
					if old.GUID == k.GUID && old.Timestamp.Equal(k.Timestamp) {
						known = true
					}
				}
				if !known {
					return errors.New("Razorgore proof kill not supported by encounter evidence")
				}
			}
			pr.Kills = []rankings.KillRecord{kills[0]}
			pr.Satisfied = true
		}
		qualified = qualified && pr.Satisfied
		if pr.Requirement.Category == rankings.SpeedrunCategoryTrash {
			continue
		}
		for _, k := range pr.Kills {
			matched := false
			for _, h := range e.Hostiles {
				if h.ID != k.GUID {
					continue
				}
				for _, period := range h.Periods {
					if period.EndState != database.EndStateSlain || period.End == nil || !period.End.Timestamp.Equal(k.Timestamp) {
						continue
					}
					for _, c := range e.Encounters {
						if c.ID == h.EncounterID && (c.KillType == database.KillTypeClean || c.KillType == database.KillTypePartial) {
							matched = true
							if c.EndTime.Time.After(completion) {
								completion = c.EndTime.Time
							}
						}
					}
				}
			}
			if !matched {
				return errors.New("speedrun proof lacks matching full encounter evidence")
			}
		}
	}

	for _, present := range required {
		if !present {
			return errors.New("incomplete BWL proof requirements")
		}
	}
	if !found || completion.IsZero() || completion.Before(s.BossToBossStartTime.Time) {
		return errors.New("incomplete speedrun completion evidence")
	}
	if proof.LevelRange != nil {
		qualified = qualified && proof.LevelRange.Satisfied
	}
	b, err := json.Marshal(proof)
	if err != nil {
		return err
	}
	var old any
	var updated any
	if err = json.Unmarshal(s.Proof, &old); err != nil {
		return err
	}
	if err = json.Unmarshal(b, &updated); err != nil {
		return err
	}
	oldJSON, _ := json.Marshal(old)
	newJSON, _ := json.Marshal(updated)
	duration := completion.Sub(s.StartTime.Time).Milliseconds()
	bossDuration := completion.Sub(s.BossToBossStartTime.Time).Milliseconds()
	if string(oldJSON) == string(newJSON) && s.Qualified == qualified && s.CompletionTime.Time.Equal(completion) && s.DurationMs == duration && s.RankedCompletionTime.Time.Equal(completion) && s.RankedDurationMs.Valid && s.RankedDurationMs.Int64 == duration && s.BossToBossCompletionTime.Time.Equal(completion) && s.BossToBossDurationMs.Valid && s.BossToBossDurationMs.Int64 == bossDuration {
		return nil
	}
	m.Speedrun = &database.RazorgoreRepairSpeedrunProofParams{InstanceID: s.InstanceID, Proof: b, Qualified: qualified, CompletionTime: database.Timestamptz(completion), DurationMs: duration, RankedCompletionTime: database.Timestamptz(completion), RankedDurationMs: pgtype.Int8{Int64: duration, Valid: true}, BossToBossCompletionTime: database.Timestamptz(completion), BossToBossDurationMs: pgtype.Int8{Int64: bossDuration, Valid: true}}
	return nil
}
func applyRazorgoreMulti(ctx context.Context, tx database.Store, m *razorgoreMultiPlan) error {
	for _, p := range m.FalseKills {
		if err := tx.RazorgoreRepairEncounter(ctx, database.RazorgoreRepairEncounterParams{InstanceID: p.InstanceID, EncounterID: p.EncounterID, KillType: p.Outcome}); err != nil {
			return err
		}
		if err := tx.RazorgoreRepairHostile(ctx, database.RazorgoreRepairHostileParams{EncounterID: p.EncounterID, ID: p.Hostile.ID, Periods: p.Hostile.Periods}); err != nil {
			return err
		}
		if err := tx.RazorgoreRepairPhase(ctx, database.RazorgoreRepairPhaseParams{EncounterID: p.EncounterID, ID: p.Phase.ID, KillType: p.Outcome}); err != nil {
			return err
		}
		if err := tx.RazorgoreRepairDeleteRankings(ctx, database.RazorgoreRepairDeleteRankingsParams{InstanceID: p.InstanceID, EncounterID: uuid.NullUUID{UUID: p.EncounterID, Valid: true}}); err != nil {
			return err
		}
	}
	for _, n := range m.Numerical {
		if err := applyRazorgoreNumeric(ctx, tx, n); err != nil {
			return err
		}
	}
	for _, id := range m.DeleteRankings {
		if err := tx.RazorgoreRepairDeleteRankings(ctx, database.RazorgoreRepairDeleteRankingsParams{InstanceID: m.InstanceID, EncounterID: uuid.NullUUID{UUID: id, Valid: true}}); err != nil {
			return err
		}
	}
	if m.Speedrun != nil {
		return tx.RazorgoreRepairSpeedrunProof(ctx, *m.Speedrun)
	}
	return nil
}
