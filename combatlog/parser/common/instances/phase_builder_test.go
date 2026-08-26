package instances

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
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

func TestBuildPhases_NoTransition_SinglePhase(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	result := buildEncounterPhases(razorgoreDefs, 0, nil, start, end, encounter.KillTypeWipe)
	require.Len(t, result, 1)
	assert.Equal(t, "razorgore_p1", result[0].Key)
	assert.Equal(t, "Phase 1 – Adds", result[0].Name)
	assert.Equal(t, 0, result[0].Order)
	assert.Equal(t, int64(0), result[0].StartOffsetMs)
	assert.Equal(t, end.Sub(start).Milliseconds(), result[0].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeWipe, result[0].KillType, "single phase inherits encounter KillType")
}

func TestBuildPhases_TransitionThenClean(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	transitionAt := start.Add(2 * time.Minute)
	end := start.Add(5 * time.Minute)

	transitions := []phases.Transition{
		{ToPhaseKey: "razorgore_p2", Timestamp: transitionAt},
	}

	result := buildEncounterPhases(razorgoreDefs, 0, transitions, start, end, encounter.KillTypeClean)
	require.Len(t, result, 2)

	// Phase 1: fight start → transition (clean)
	assert.Equal(t, "razorgore_p1", result[0].Key)
	assert.Equal(t, int64(0), result[0].StartOffsetMs)
	assert.Equal(t, transitionAt.Sub(start).Milliseconds(), result[0].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeClean, result[0].KillType)

	// Phase 2: transition → fight end (inherits encounter KillType)
	assert.Equal(t, "razorgore_p2", result[1].Key)
	assert.Equal(t, transitionAt.Sub(start).Milliseconds(), result[1].StartOffsetMs)
	assert.Equal(t, end.Sub(start).Milliseconds(), result[1].EndOffsetMs)
	assert.Equal(t, encounter.KillTypeClean, result[1].KillType)
}

func TestBuildPhases_TransitionThenPartial(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	transitionAt := start.Add(2 * time.Minute)
	end := start.Add(5 * time.Minute)

	transitions := []phases.Transition{
		{ToPhaseKey: "razorgore_p2", Timestamp: transitionAt},
	}

	result := buildEncounterPhases(razorgoreDefs, 0, transitions, start, end, encounter.KillTypePartial)
	require.Len(t, result, 2)
	assert.Equal(t, encounter.KillTypeClean, result[0].KillType)
	assert.Equal(t, encounter.KillTypePartial, result[1].KillType, "final phase inherits encounter KillType")
}

func TestBuildPhases_TransitionThenWipe(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	transitionAt := start.Add(2 * time.Minute)
	end := start.Add(5 * time.Minute)

	transitions := []phases.Transition{
		{ToPhaseKey: "razorgore_p2", Timestamp: transitionAt},
	}

	result := buildEncounterPhases(razorgoreDefs, 0, transitions, start, end, encounter.KillTypeWipe)
	require.Len(t, result, 2)
	assert.Equal(t, encounter.KillTypeClean, result[0].KillType)
	assert.Equal(t, encounter.KillTypeWipe, result[1].KillType, "final phase inherits wipe")
}

func TestBuildPhases_DuplicateTransitionIgnored(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	t1 := start.Add(2 * time.Minute)
	t2 := start.Add(3 * time.Minute)
	end := start.Add(5 * time.Minute)

	transitions := []phases.Transition{
		{ToPhaseKey: "razorgore_p2", Timestamp: t1},
		{ToPhaseKey: "razorgore_p2", Timestamp: t2}, // duplicate
	}

	result := buildEncounterPhases(razorgoreDefs, 0, transitions, start, end, encounter.KillTypeClean)
	require.Len(t, result, 2, "duplicate transition should be ignored")
	assert.Equal(t, t1.Sub(start).Milliseconds(), result[1].StartOffsetMs, "first transition timestamp used")
}

func TestBuildPhases_UnknownPhaseKeyIgnored(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	transitions := []phases.Transition{
		{ToPhaseKey: "unknown_phase", Timestamp: start.Add(1 * time.Minute)},
	}

	result := buildEncounterPhases(razorgoreDefs, 0, transitions, start, end, encounter.KillTypeWipe)
	require.Len(t, result, 1, "unknown phase key results in single phase")
	assert.Equal(t, "razorgore_p1", result[0].Key)
}

func TestBuildPhases_OutOfRangeTransitionIgnored(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	transitions := []phases.Transition{
		// At fight start (not after it)
		{ToPhaseKey: "razorgore_p2", Timestamp: start},
	}

	result := buildEncounterPhases(razorgoreDefs, 0, transitions, start, end, encounter.KillTypeWipe)
	require.Len(t, result, 1, "transition at fight start should be ignored")
}

func TestBuildPhases_IgnoresOtherPhaseSource(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)
	source := guid.GUID(1)

	result := buildEncounterPhases(razorgoreDefs, source, []phases.Transition{
		{SourceGUID: guid.GUID(2), ToPhaseKey: "razorgore_p2", Timestamp: start.Add(time.Minute)},
	}, start, end, encounter.KillTypeWipe)

	require.Len(t, result, 1)
	assert.Equal(t, "razorgore_p1", result[0].Key)
	assert.Equal(t, encounter.KillTypeWipe, result[0].KillType)
}

func TestBuildPhases_RejectsSkippedPhase(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)
	defs := &phases.EncounterPhases{
		EncounterName: "Three Phase Boss",
		Definitions: []phases.Definition{
			{Key: "p1", Name: "Phase 1", Order: 0},
			{Key: "p2", Name: "Phase 2", Order: 1},
			{Key: "p3", Name: "Phase 3", Order: 2},
		},
	}

	result := buildEncounterPhases(defs, 0, []phases.Transition{
		{ToPhaseKey: "p3", Timestamp: start.Add(time.Minute)},
	}, start, end, encounter.KillTypeWipe)

	require.Len(t, result, 1)
	assert.Equal(t, "p1", result[0].Key)
}

func TestBuildPhases_NilDefs(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	result := buildEncounterPhases(nil, 0, nil, start, end, encounter.KillTypeClean)
	require.Nil(t, result)
}
