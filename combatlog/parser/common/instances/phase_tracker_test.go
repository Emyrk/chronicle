package instances

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var razorgoreDefs = &phases.EncounterPhases{
	EncounterName: "Razorgore the Untamed",
	Definitions: []phases.Definition{
		{Key: "razorgore_p1", Name: "Phase 1 – Adds", Order: 0},
		{Key: "razorgore_p2", Name: "Phase 2 – Boss", Order: 1},
	},
}

func momentAt(ts time.Time) period.Moment {
	return period.Moment{
		Timestamp: &messages.Slain{
			MessageBase: messages.Base(ts),
		},
		Reason: "test",
	}
}

func TestPhaseTracker_P1OpenAtFightStart(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	require.NotNil(t, pt)

	cur := pt.currentPhase()
	require.NotNil(t, cur, "should have an open phase immediately")
	assert.Equal(t, "razorgore_p1", cur.Key)
	assert.Equal(t, "Phase 1 – Adds", cur.Name)
	assert.Equal(t, 0, cur.Order)
	assert.Equal(t, int64(0), cur.StartOffsetMs)
	assert.NotEqual(t, [16]byte{}, cur.ID, "phase ID must be generated")
}

func TestPhaseTracker_TransitionClosesAndOpens(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	transitionAt := start.Add(2 * time.Minute)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	require.NotNil(t, pt)

	ok := pt.transition(phases.Transition{
		SourceGUID: source,
		ToPhaseKey: "razorgore_p2",
		Timestamp:  transitionAt,
	})
	require.True(t, ok, "valid transition should succeed")

	// After transition, current phase is P2.
	cur := pt.currentPhase()
	require.NotNil(t, cur)
	assert.Equal(t, "razorgore_p2", cur.Key)
	assert.Equal(t, 1, cur.Order)
	assert.Equal(t, transitionAt.Sub(start).Milliseconds(), cur.StartOffsetMs)

	// P1 should be closed with clean kill type.
	all := pt.materialized()
	require.Len(t, all, 2)
	assert.Equal(t, "razorgore_p1", all[0].Key)
	assert.Equal(t, int64(0), all[0].StartOffsetMs)
	assert.Equal(t, transitionAt.Sub(start).Milliseconds(), all[0].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeClean, all[0].KillType)
}

func TestPhaseTracker_FightEndClosesFinalPhase(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	transitionAt := start.Add(2 * time.Minute)
	end := start.Add(5 * time.Minute)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	pt.transition(phases.Transition{
		SourceGUID: source,
		ToPhaseKey: "razorgore_p2",
		Timestamp:  transitionAt,
	})

	pt.close(momentAt(end), encounter.KillTypeClean)

	all := pt.materialized()
	require.Len(t, all, 2)

	// Phase 1: clean, start→transition
	assert.Equal(t, "razorgore_p1", all[0].Key)
	assert.Equal(t, int64(0), all[0].StartOffsetMs)
	assert.Equal(t, transitionAt.Sub(start).Milliseconds(), all[0].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeClean, all[0].KillType)

	// Phase 2: inherits encounter kill type, transition→end
	assert.Equal(t, "razorgore_p2", all[1].Key)
	assert.Equal(t, transitionAt.Sub(start).Milliseconds(), all[1].StartOffsetMs)
	assert.Equal(t, end.Sub(start).Milliseconds(), all[1].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeClean, all[1].KillType)
}

func TestPhaseTracker_NoTransition_SinglePhase(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	pt.close(momentAt(end), encounter.KillTypeWipe)

	all := pt.materialized()
	require.Len(t, all, 1)
	assert.Equal(t, "razorgore_p1", all[0].Key)
	assert.Equal(t, int64(0), all[0].StartOffsetMs)
	assert.Equal(t, end.Sub(start).Milliseconds(), all[0].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeWipe, all[0].KillType)
}

func TestPhaseTracker_FinalOutcomeAssignment(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	transitionAt := start.Add(2 * time.Minute)
	end := start.Add(5 * time.Minute)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	pt.transition(phases.Transition{
		SourceGUID: source,
		ToPhaseKey: "razorgore_p2",
		Timestamp:  transitionAt,
	})

	// Close with empty kill type (as finalizeFight does).
	pt.close(momentAt(end), "")

	all := pt.materialized()
	require.Len(t, all, 2)
	assert.Equal(t, encounter.KillTypeClean, all[0].KillType, "prior phases stay clean")
	assert.Equal(t, encounter.KillType(""), all[1].KillType, "final phase unassigned")

	// Simulate fightEncounter assigning the outcome.
	all[len(all)-1].KillType = encounter.KillTypeWipe
	assert.Equal(t, encounter.KillTypeWipe, all[1].KillType)
}

func TestPhaseTracker_DuplicateTransitionIgnored(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))

	t1 := start.Add(2 * time.Minute)
	t2 := start.Add(3 * time.Minute)

	ok := pt.transition(phases.Transition{SourceGUID: source, ToPhaseKey: "razorgore_p2", Timestamp: t1})
	require.True(t, ok)

	ok = pt.transition(phases.Transition{SourceGUID: source, ToPhaseKey: "razorgore_p2", Timestamp: t2})
	require.False(t, ok, "duplicate transition to same phase should be rejected")

	assert.Len(t, pt.materialized(), 2, "still exactly 2 phases")
}

func TestPhaseTracker_UnknownPhaseKeyIgnored(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	ok := pt.transition(phases.Transition{
		SourceGUID: source,
		ToPhaseKey: "unknown_phase",
		Timestamp:  start.Add(time.Minute),
	})
	require.False(t, ok)
	assert.Len(t, pt.materialized(), 1, "unknown key yields single phase")
}

func TestPhaseTracker_OutOfRangeTransitionIgnored(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))

	// At fight start (not strictly after)
	ok := pt.transition(phases.Transition{
		SourceGUID: source,
		ToPhaseKey: "razorgore_p2",
		Timestamp:  start,
	})
	require.False(t, ok, "transition at fight start should be rejected")
	assert.Len(t, pt.materialized(), 1)
}

func TestPhaseTracker_IgnoresOtherSourceGUID(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	source := guid.GUID(1)

	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	ok := pt.transition(phases.Transition{
		SourceGUID: guid.GUID(2),
		ToPhaseKey: "razorgore_p2",
		Timestamp:  start.Add(time.Minute),
	})
	require.False(t, ok)
	assert.Len(t, pt.materialized(), 1)
}

func TestPhaseTracker_RejectsSkippedPhase(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	source := guid.GUID(1)

	defs := &phases.EncounterPhases{
		EncounterName: "Three Phase Boss",
		Definitions: []phases.Definition{
			{Key: "p1", Name: "Phase 1", Order: 0},
			{Key: "p2", Name: "Phase 2", Order: 1},
			{Key: "p3", Name: "Phase 3", Order: 2},
		},
	}

	pt := newPhaseTracker(defs, source, momentAt(start))
	ok := pt.transition(phases.Transition{
		SourceGUID: source,
		ToPhaseKey: "p3",
		Timestamp:  start.Add(time.Minute),
	})
	require.False(t, ok, "skipping p2 should be rejected")
	assert.Len(t, pt.materialized(), 1)
	assert.Equal(t, "p1", pt.currentPhase().Key)
}

func TestPhaseTracker_NilDefs(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	pt := newPhaseTracker(nil, 0, momentAt(start))
	require.Nil(t, pt)

	// Nil tracker methods are safe to call.
	assert.False(t, pt.transition(phases.Transition{}))
	pt.close(momentAt(start.Add(time.Minute)), encounter.KillTypeClean)
	assert.Nil(t, pt.materialized())
	assert.Nil(t, pt.currentPhase())
}

func TestPhaseTracker_StagedFirstMessageTransition(t *testing.T) {
	t.Parallel()

	// Simulates the scenario where a transition is emitted on the same
	// message that starts the fight. The transition is staged because
	// Characters.Process runs before fight detection.
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	transitionAt := start.Add(1 * time.Millisecond) // slightly after start
	end := start.Add(5 * time.Minute)
	source := guid.GUID(1)

	// Stage 1: character emits transition (no tracker yet).
	staged := []phases.Transition{
		{SourceGUID: source, ToPhaseKey: "razorgore_p2", Timestamp: transitionAt},
	}

	// Stage 2: fight starts, tracker initialized.
	pt := newPhaseTracker(razorgoreDefs, source, momentAt(start))
	require.NotNil(t, pt)

	// Stage 3: drain staged transitions.
	for _, s := range staged {
		pt.transition(s)
	}

	// Verify P2 is now current.
	cur := pt.currentPhase()
	require.NotNil(t, cur)
	assert.Equal(t, "razorgore_p2", cur.Key)

	// Close and verify full timeline.
	pt.close(momentAt(end), encounter.KillTypeClean)
	all := pt.materialized()
	require.Len(t, all, 2)
	assert.Equal(t, "razorgore_p1", all[0].Key)
	assert.Equal(t, int64(0), all[0].StartOffsetMs)
	assert.Equal(t, transitionAt.Sub(start).Milliseconds(), all[0].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeClean, all[0].KillType)
	assert.Equal(t, "razorgore_p2", all[1].Key)
	assert.Equal(t, encounter.KillTypeClean, all[1].KillType)
}
