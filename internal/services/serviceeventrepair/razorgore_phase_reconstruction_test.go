package serviceeventrepair

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func fixtureRazorgoreEggs(t *testing.T, flavor database.FlavorTag, count int) razorgoreEvidence {
	t.Helper()
	e := fixtureRazorgoreNumeric(t)
	e.Phases = nil
	e.Group.Format = database.NullLogFormat{LogFormat: database.LogFormat112aCcAddon, Valid: true}
	e.Group.Flavor = []string{string(flavor)}
	var casts []proto.Message
	for i := 1; i <= count; i++ {
		casts = append(casts, &chronicleproto.SpellGo{Meta: &chronicleproto.EventMeta{Index: int32(i), OffsetMilli: int64(i) * 1000}, SpellData: &chronicleproto.SpellData{Id: 19873}, Caster: e.Hostiles[0].ID.String()})
	}
	e.Events = append(e.Events, database.LogInstanceEvent{Type: database.LogInstanceEventTypeSpellGo, Events: numericFrame(t, e, casts...)})
	return e
}

func TestRazorgoreReconstructEggPhases(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		flavor database.FlavorTag
		count  int
	}{{"twenty", database.FlavorNightmareOfUrsol, 20}, {"thirty", database.FlavorVanillaPlus, 30}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgoreEggs(t, tc.flavor, tc.count)
			p := &RazorgoreRepairPlan{}
			reconstructed, err := reconstructRazorgorePhases(e, p)
			require.NoError(t, err)
			require.Empty(t, e.Phases, "original evidence must not be changed")
			require.Len(t, reconstructed.Phases, 2)
			require.Len(t, p.reconstructedPhases, 2)
			require.EqualValues(t, tc.count*1000, reconstructed.Phases[1].StartOffsetMs)
			require.Equal(t, e.Events, reconstructed.Events)
			require.Equal(t, e.Encounters, reconstructed.Encounters)
			require.Equal(t, []razorgorePhaseDetail{{EncounterID: e.Encounters[0].ID, StartOffsetMS: int64(tc.count) * 1000, EndOffsetMS: 60000, Reconstructed: true}}, p.Details["phases"])
			again := &RazorgoreRepairPlan{}
			_, err = reconstructRazorgorePhases(e, again)
			require.NoError(t, err)
			require.Equal(t, p.reconstructedPhases, again.reconstructedPhases, "stable phase IDs across preview/apply")
		})
	}
}

func TestRazorgoreEggReconstructionRejectsAmbiguity(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(*razorgoreEvidence){
		"missing stream":     func(e *razorgoreEvidence) { e.Events = e.Events[:len(e.Events)-1] },
		"corrupt stream":     func(e *razorgoreEvidence) { e.Events[len(e.Events)-1].Events = []byte("corrupt") },
		"unsupported flavor": func(e *razorgoreEvidence) { e.Group.Flavor = nil },
		"ambiguous flavor": func(e *razorgoreEvidence) {
			e.Group.Flavor = append(e.Group.Flavor, string(database.FlavorNightmareOfUrsol))
		},
		"incomplete threshold": func(e *razorgoreEvidence) { *e = fixtureRazorgoreEggs(t, database.FlavorVanillaPlus, 29) },
		"excess threshold":     func(e *razorgoreEvidence) { *e = fixtureRazorgoreEggs(t, database.FlavorVanillaPlus, 31) },
		"unknown format":       func(e *razorgoreEvidence) { e.Group.Format.Valid = false },
		"missing boss":         func(e *razorgoreEvidence) { e.Hostiles = nil },
		"overlapping pull": func(e *razorgoreEvidence) {
			other := e.Encounters[0]
			other.ID[0]++
			e.Encounters = append(e.Encounters, other)
		},
		"duplicate cast": func(e *razorgoreEvidence) {
			cast := &chronicleproto.SpellGo{Meta: &chronicleproto.EventMeta{Index: 1, OffsetMilli: 1000}, SpellData: &chronicleproto.SpellData{Id: 19873}, Caster: e.Hostiles[0].ID.String()}
			e.Events[len(e.Events)-1].Events = numericFrame(t, *e, cast, cast)
		},
		"foreign caster": func(e *razorgoreEvidence) {
			cast := &chronicleproto.SpellGo{Meta: &chronicleproto.EventMeta{Index: 1, OffsetMilli: 1000}, SpellData: &chronicleproto.SpellData{Id: 19873}, Caster: e.Rankings[0].PlayerGuid}
			e.Events[len(e.Events)-1].Events = numericFrame(t, *e, cast)
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgoreEggs(t, database.FlavorVanillaPlus, 30)
			mutate(&e)
			_, err := reconstructRazorgorePhases(e, &RazorgoreRepairPlan{})
			require.Error(t, err)
		})
	}
}

func TestRazorgoreExistingPhasesAreNotReinferred(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreNumeric(t)
	p := &RazorgoreRepairPlan{}
	got, err := reconstructRazorgorePhases(e, p)
	require.NoError(t, err)
	require.Equal(t, e.Phases, got.Phases)
	require.Empty(t, p.reconstructedPhases)
	require.Equal(t, false, p.Details["phases"].([]razorgorePhaseDetail)[0].Reconstructed)
	// Existing malformed phase evidence stays malformed and fails normal validation.
	e.Phases[1].StartOffsetMs++
	got, err = reconstructRazorgorePhases(e, &RazorgoreRepairPlan{})
	require.NoError(t, err)
	plan, err := evaluateRazorgoreEvidence(got)
	require.NoError(t, err)
	require.True(t, plan.RequiresReparse)
}

func TestRazorgoreReconstructedPhasesReachNumericalPlan(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreEggs(t, database.FlavorVanillaPlus, 30)
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Len(t, p.reconstructedPhases, 2)
	require.NotNil(t, p.numeric)
	require.EqualValues(t, 30000, p.numeric.Window.StartMs.Int64)
	require.Contains(t, p.Changes, "reconstruct Razorgore phases from stored egg casts "+e.Encounters[0].ID.String())
}

func TestRazorgoreReconstructedWipeRetainsCompletedPhaseOne(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreEggs(t, database.FlavorNightmareOfUrsol, 20)
	e.Encounters[0].KillType = database.KillTypeWipe
	p := &RazorgoreRepairPlan{}
	got, err := reconstructRazorgorePhases(e, p)
	require.NoError(t, err)
	require.Equal(t, database.KillTypeClean, got.Phases[0].KillType)
	require.Equal(t, database.KillTypeWipe, got.Phases[1].KillType)
	require.Equal(t, database.KillTypeClean, p.reconstructedPhases[0].KillType)
}

func (s *razorgoreStore) InsertEncounterPhase(_ context.Context, p database.InsertEncounterPhaseParams) error {
	s.writes = append(s.writes, "insert_phase")
	s.e.Phases = append(s.e.Phases, database.LogInstanceEncounterPhase(p))
	return nil
}

func TestRazorgoreReconstructedPhaseApplyAndSeal(t *testing.T) {
	t.Parallel()
	for _, tamper := range []bool{false, true} {
		t.Run(map[bool]string{false: "apply", true: "tampered"}[tamper], func(t *testing.T) {
			t.Parallel()
			s := &razorgoreStore{e: fixtureRazorgoreEggs(t, database.FlavorVanillaPlus, 30)}
			ctx := context.Background()
			s.e.Instance.LogGroupID = uuid.New()
			originalEvents := append([]database.LogInstanceEvent(nil), s.e.Events...)
			plan, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
			require.NoError(t, err)
			require.False(t, plan.RequiresReparse, plan.Reason)
			require.NoError(t, RevalidateRazorgore(ctx, s, plan))
			if tamper {
				plan.reconstructedPhases[1].StartOffsetMs++
				require.ErrorContains(t, ApplyRazorgore(ctx, s, plan), "modified")
				require.Empty(t, s.writes)
				return
			}
			require.NoError(t, ApplyRazorgore(ctx, s, plan))
			require.Equal(t, []string{"insert_phase", "insert_phase", "window", "metrics", "metrics"}, s.writes)
			require.Len(t, s.e.Phases, 2)
			require.EqualValues(t, 30000, s.e.Phases[1].StartOffsetMs)
			require.Equal(t, originalEvents, s.e.Events)
			require.ErrorIs(t, RevalidateRazorgore(ctx, s, plan), ErrStaleEvidence)
		})
	}
}

func (s *razorgoreStore) RazorgoreRepairLogGroup(context.Context, uuid.UUID) (database.WoWLogGroup, error) {
	return s.e.Group, nil
}
