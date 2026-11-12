package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestPhaseTrackerStateContinuation(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	m := messages.TimedOut(at)
	defs := &phases.EncounterPhases{EncounterName: "Boss", Definitions: []phases.Definition{{Key: "one", Name: "One", Order: 0}, {Key: "two", Name: "Two", Order: 1}, {Key: "three", Name: "Three", Order: 2}}}
	original := newPhaseTracker(defs, 1, period.Moment{Timestamp: m, Reason: "start"})
	require.True(t, original.transition(phases.Transition{SourceGUID: 1, ToPhaseKey: "two", Timestamp: at.Add(time.Second)}))
	s, e := original.CaptureState(func(messages.Message) (string, error) { return "start", nil })
	require.NoError(t, e)
	data, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodePhaseTrackerState(PhaseTrackerStateVersion, data)
	require.NoError(t, e)
	restored := InitPhaseTracker()
	require.NoError(t, restored.RestoreState(s, defs, func(string) (messages.Message, error) { return m, nil }))
	require.Same(t, defs, restored.defs)
	require.Same(t, m, restored.fightStart.Timestamp)
	require.Equal(t, original.phases, restored.phases)
	require.Error(t, restored.RestoreState(s, &phases.EncounterPhases{}, nil))
	require.Equal(t, original.phases, restored.phases)
	require.Error(t, restored.RestoreState(s, defs, func(string) (messages.Message, error) { return nil, nil }))
	require.Equal(t, original.phases, restored.phases)
	for _, p := range []*phaseTracker{original, restored} {
		require.False(t, p.transition(phases.Transition{SourceGUID: 2, ToPhaseKey: "three", Timestamp: at.Add(2 * time.Second)}))
		require.False(t, p.transition(phases.Transition{SourceGUID: 1, ToPhaseKey: "three", Timestamp: at.Add(time.Second)}))
		require.True(t, p.transition(phases.Transition{SourceGUID: 1, ToPhaseKey: "three", Timestamp: at.Add(2 * time.Second)}))
		p.close(period.Moment{Timestamp: messages.TimedOut(at.Add(2 * time.Second))}, encounter.KillTypeClean)
	}
	// End-boundary rollback removes the newly UUID-assigned third phase; captured
	// phase UUIDs and all offsets survive exactly without constructor replay.
	require.Equal(t, original.phases, restored.phases)
	require.Len(t, restored.phases, 2)
	require.Equal(t, 1, restored.currentDefIdx)
	again, e := s.Encode()
	require.NoError(t, e)
	require.Equal(t, data, again)
	for _, payload := range []string{`null`, `{}`, `{"current":0}`} {
		_, e = DecodePhaseTrackerState(PhaseTrackerStateVersion, []byte(payload))
		require.Error(t, e)
	}
}
