package serviceeventrepair

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func fixtureRazorgoreMultiple(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureRazorgoreNumeric(t)
	e.Group.Format = database.NullLogFormat{LogFormat: database.LogFormat112aCcAddon, Valid: true}
	e.Events = append(e.Events, database.LogInstanceEvent{Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e, &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 0, OffsetMilli: 0}, Target: "0xF130003090000001", UnitType: int32(unitdb.UnitTypeCreature), Affiliation: int32(unitdb.AffiliationHostile)})}, database.LogInstanceEvent{Type: database.LogInstanceEventTypeAuraCast, Events: numericFrame(t, e)})
	old := fixtureRazorgore(t)
	id := uuid.New()
	old.Encounters[0].ID = id
	old.Encounters[0].StartTime = database.Timestamptz(e.Encounters[0].StartTime.Time.Add(-2 * time.Minute))
	old.Encounters[0].EndTime = database.Timestamptz(old.Encounters[0].StartTime.Time.Add(time.Minute))
	old.Hostiles[0].EncounterID = id
	old.Hostiles[0].Periods[0].Start.Timestamp = old.Encounters[0].StartTime.Time
	old.Hostiles[0].Periods[0].End.Timestamp = old.Encounters[0].EndTime.Time
	old.Phases[0].ID = uuid.New()
	old.Phases[0].EncounterID = id
	old.Rankings[0].ID = uuid.New()
	old.Rankings[0].EncounterID = uuid.NullUUID{UUID: id, Valid: true}
	deaths := numericFrame(t, old, &chronicleproto.Slain{Meta: &chronicleproto.EventMeta{Index: 0, OffsetMilli: 60000}, Target: old.Hostiles[0].ID.String()})
	for i := range e.Events {
		if e.Events[i].Type == database.LogInstanceEventTypeSlain {
			e.Events[i].Events = append(deaths, e.Events[i].Events...)
		}
	}
	e.Encounters = append([]database.LogInstanceEncounter{old.Encounters[0]}, e.Encounters...)
	e.Hostiles = append(old.Hostiles, e.Hostiles...)
	e.Phases = append(old.Phases, e.Phases...)
	e.Rankings = append(old.Rankings, e.Rankings...)
	s := &e.Speedruns[0]
	s.StartTime = old.Encounters[0].StartTime
	s.RankedStartTime = s.StartTime
	s.BossToBossStartTime = s.StartTime
	s.CompletionTime = old.Encounters[0].EndTime
	s.RankedCompletionTime = s.CompletionTime
	s.BossToBossCompletionTime = s.CompletionTime
	s.DurationMs = 60000
	s.RankedDurationMs = pgtype.Int8{Int64: 60000, Valid: true}
	s.BossToBossDurationMs = s.RankedDurationMs
	var proof rankings.SpeedrunProofPayload
	require.NoError(t, json.Unmarshal(s.Proof, &proof))
	for i := range proof.Proof {
		if proof.Proof[i].Requirement.EntryIDs[0] == 12435 {
			proof.Proof[i].Kills[0].Timestamp = old.Encounters[0].EndTime.Time
		}
	}
	var err error
	s.Proof, err = json.Marshal(proof)
	require.NoError(t, err)
	return e
}
func TestRazorgoreMultiPullRepairsFalseKillAndTrueKill(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreMultiple(t)
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.NotNil(t, p.multi)
	require.Len(t, p.multi.FalseKills, 1)
	require.Len(t, p.multi.Numerical, 1)
	require.NotEmpty(t, p.multi.Numerical[0].Metrics)
	require.Equal(t, database.KillTypeReset, p.multi.FalseKills[0].Outcome)
	require.NotNil(t, p.multi.Speedrun)
	require.EqualValues(t, 180000, p.multi.Speedrun.DurationMs, "speedrun retains both full pulls and intervening time, not P2 duration")
	require.Equal(t, e.Encounters[1].EndTime.Time, p.multi.Speedrun.CompletionTime.Time)
	for _, metric := range p.multi.Numerical[0].Metrics {
		require.Equal(t, 30.0, metric.DurationSecs)
	}
	// Both independent private write payloads participate in the prepared seal.
	p.seal, err = razorgorePlanSeal(p)
	require.NoError(t, err)
	require.NoError(t, validateRazorgorePlan(p))
	p.multi.FalseKills[0].Hostile.Periods[0].EndState = database.EndStateSlain
	require.ErrorContains(t, ApplyRazorgore(context.Background(), nil, p), "modified")
}
func TestRazorgoreMultiPullRejectsUnprovenProof(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreMultiple(t)
	e.Speedruns[0].RankedStartTime = database.Timestamptz(e.Encounters[1].StartTime.Time)
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.True(t, p.RequiresReparse)
	require.Contains(t, p.Reason, "start boundaries")
}
func TestRazorgoreMultiPullPreservesNonBossSourceMetrics(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreMultiple(t)
	trash := e.Encounters[1]
	trash.ID = uuid.New()
	trash.Name = "Trash"
	trash.Boss = false
	e.Encounters = append(e.Encounters, trash)
	row := e.Rankings[1]
	row.ID = uuid.New()
	row.EncounterID = uuid.NullUUID{UUID: trash.ID, Valid: true}
	e.Rankings = append(e.Rankings, row)
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	for _, n := range p.multi.Numerical {
		for _, metric := range n.Metrics {
			require.NotEqual(t, row.ID, metric.ID)
		}
	}
}

func TestRazorgoreMultiPullProvesNoopAfterAllSourceChanges(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreMultiple(t)
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	for _, fix := range p.multi.FalseKills {
		for i := range e.Encounters {
			if e.Encounters[i].ID == fix.EncounterID {
				e.Encounters[i].KillType = fix.Outcome
				e.Encounters[i].RankingStartOffsetMs = pgtype.Int8{}
				e.Encounters[i].RankingEndOffsetMs = pgtype.Int8{}
			}
		}
		for i := range e.Hostiles {
			if e.Hostiles[i].EncounterID == fix.EncounterID && e.Hostiles[i].ID == fix.Hostile.ID {
				e.Hostiles[i] = *fix.Hostile
			}
		}
		for i := range e.Phases {
			if e.Phases[i].ID == fix.Phase.ID {
				e.Phases[i].KillType = fix.Outcome
			}
		}
		kept := e.Rankings[:0]
		for _, r := range e.Rankings {
			if r.EncounterID.UUID != fix.EncounterID {
				kept = append(kept, r)
			}
		}
		e.Rankings = kept
	}
	for _, n := range p.multi.Numerical {
		for i := range e.Encounters {
			if e.Encounters[i].ID == n.Window.EncounterID {
				e.Encounters[i].RankingStartOffsetMs = n.Window.StartMs
				e.Encounters[i].RankingEndOffsetMs = n.Window.EndMs
			}
		}
		for _, metric := range n.Metrics {
			for i := range e.Rankings {
				if e.Rankings[i].ID == metric.ID {
					b, err := json.Marshal(metric)
					require.NoError(t, err)
					require.NoError(t, json.Unmarshal(b, &e.Rankings[i]))
				}
			}
		}
	}
	b, err := json.Marshal(p.multi.Speedrun)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(b, &e.Speedruns[0]))
	again, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, again.RequiresReparse, again.Reason)
	require.Empty(t, again.Changes)
}
