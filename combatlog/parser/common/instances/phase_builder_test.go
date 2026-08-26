package instances_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// buildPhasesFromDefs is a test-only reimplementation of the phase builder
// logic so we can unit-test it without needing the full Hookable. It mirrors
// Hookable.buildPhasesFromTransitions.
func buildPhasesFromDefs(
	phaseDefs *phases.EncounterPhases,
	transitions []phases.Transition,
	fightStart, fightEnd time.Time,
	encounterKillType encounter.KillType,
) []encounter.Phase {
	if phaseDefs == nil || len(phaseDefs.Definitions) == 0 {
		return nil
	}

	defByKey := make(map[string]int, len(phaseDefs.Definitions))
	for i, d := range phaseDefs.Definitions {
		defByKey[d.Key] = i
	}

	type validTransition struct {
		defIdx    int
		timestamp time.Time
	}
	var valid []validTransition
	seen := make(map[string]bool)
	var lastTS time.Time

	for _, t := range transitions {
		idx, ok := defByKey[t.ToPhaseKey]
		if !ok {
			continue
		}
		if seen[t.ToPhaseKey] {
			continue
		}
		if !t.Timestamp.After(fightStart) || t.Timestamp.After(fightEnd) {
			continue
		}
		if !lastTS.IsZero() && !t.Timestamp.After(lastTS) {
			continue
		}
		seen[t.ToPhaseKey] = true
		lastTS = t.Timestamp
		valid = append(valid, validTransition{defIdx: idx, timestamp: t.Timestamp})
	}

	firstDef := phaseDefs.Definitions[0]
	var result []encounter.Phase

	if len(valid) == 0 {
		result = append(result, encounter.PhaseFromTimes(
			[16]byte{1}, firstDef.Key, firstDef.Name, firstDef.Order,
			encounterKillType,
			fightStart, fightStart, fightEnd,
		))
		return result
	}

	result = append(result, encounter.PhaseFromTimes(
		[16]byte{1}, firstDef.Key, firstDef.Name, firstDef.Order,
		encounter.KillTypeClean,
		fightStart, fightStart, valid[0].timestamp,
	))

	for i := 0; i < len(valid)-1; i++ {
		def := phaseDefs.Definitions[valid[i].defIdx]
		result = append(result, encounter.PhaseFromTimes(
			[16]byte{byte(i + 2)}, def.Key, def.Name, def.Order,
			encounter.KillTypeClean,
			fightStart, valid[i].timestamp, valid[i+1].timestamp,
		))
	}

	lastTrans := valid[len(valid)-1]
	lastDef := phaseDefs.Definitions[lastTrans.defIdx]
	result = append(result, encounter.PhaseFromTimes(
		[16]byte{byte(len(valid) + 1)}, lastDef.Key, lastDef.Name, lastDef.Order,
		encounterKillType,
		fightStart, lastTrans.timestamp, fightEnd,
	))

	return result
}

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

	result := buildPhasesFromDefs(razorgoreDefs, nil, start, end, encounter.KillTypeWipe)
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

	result := buildPhasesFromDefs(razorgoreDefs, transitions, start, end, encounter.KillTypeClean)
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

	result := buildPhasesFromDefs(razorgoreDefs, transitions, start, end, encounter.KillTypePartial)
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

	result := buildPhasesFromDefs(razorgoreDefs, transitions, start, end, encounter.KillTypeWipe)
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

	result := buildPhasesFromDefs(razorgoreDefs, transitions, start, end, encounter.KillTypeClean)
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

	result := buildPhasesFromDefs(razorgoreDefs, transitions, start, end, encounter.KillTypeWipe)
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

	result := buildPhasesFromDefs(razorgoreDefs, transitions, start, end, encounter.KillTypeWipe)
	require.Len(t, result, 1, "transition at fight start should be ignored")
}

func TestBuildPhases_NilDefs(t *testing.T) {
	t.Parallel()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	result := buildPhasesFromDefs(nil, nil, start, end, encounter.KillTypeClean)
	require.Nil(t, result)
}
