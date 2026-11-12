package participants

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func participantStateBytes(t *testing.T, state TrackerState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func participantMessages(start time.Time, players [2]guid.GUID) []messages.Message {
	return []messages.Message{
		&messages.Slain{MessageBase: messages.Base(start.Add(time.Second)), Victim: players[0]},
		&messages.Heal{MessageBase: messages.Base(start.Add(2 * time.Second)), Caster: players[1], Target: players[1], Amount: 1},
		&messages.Slain{MessageBase: messages.Base(start.Add(3 * time.Second)), Victim: players[1]},
		&messages.Resurrection{MessageBase: messages.Base(start.Add(4 * time.Second)), Source: players[1], Target: players[0]},
	}
}

func TestTrackerStateContinuation(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 12, 1, 0, 0, 0, time.UTC)
	fightID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	players := [2]guid.GUID{1, 2}
	boss := guid.GUID(0xF13000808A000424)
	pull := &messages.Damage{MessageBase: messages.Base(start), Caster: &players[0], Target: boss, Amount: 1}

	for split := 0; split <= len(participantMessages(start, players)); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := New()
			continuous.Active[players[0]] = true
			continuous.Active[players[1]] = false
			continuous.FightStarted(fightID, pull)
			prefix := participantMessages(start, players)
			for _, message := range prefix[:split] {
				require.NoError(t, continuous.ProcessMessage(true, fightID, message))
			}

			captured, err := continuous.CaptureState()
			require.NoError(t, err)
			payload := participantStateBytes(t, captured)
			decoded, err := DecodeTrackerState(TrackerStateVersion, payload)
			require.NoError(t, err)
			restored, err := decoded.Restore()
			require.NoError(t, err)

			continuousSuffix := participantMessages(start, players)
			restoredSuffix := participantMessages(start, players)
			for _, message := range continuousSuffix[split:] {
				require.NoError(t, continuous.ProcessMessage(true, fightID, message))
			}
			for _, message := range restoredSuffix[split:] {
				require.NoError(t, restored.ProcessMessage(true, fightID, message))
			}
			require.Equal(t, continuous.NoKnownParticipantsAlive(), restored.NoKnownParticipantsAlive())
			continuous.FightEnded(fightID, messages.TimedOut(start.Add(5*time.Second)))
			restored.FightEnded(fightID, messages.TimedOut(start.Add(5*time.Second)))
			continuousState, err := continuous.CaptureState()
			require.NoError(t, err)
			restoredState, err := restored.CaptureState()
			require.NoError(t, err)
			require.Equal(t, participantStateBytes(t, continuousState), participantStateBytes(t, restoredState))
			require.Equal(t, payload, participantStateBytes(t, captured))
			require.Equal(t, payload, participantStateBytes(t, decoded))
		})
	}
}

func TestTrackerStateDetachedRestore(t *testing.T) {
	t.Parallel()
	tracker := New()
	tracker.Active[1] = true
	tracker.fightActive = true
	tracker.known[1] = struct{}{}
	tracker.dead[1] = struct{}{}
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	before := participantStateBytes(t, state)

	tracker.Active[1] = false
	delete(tracker.dead, 1)
	require.Equal(t, before, participantStateBytes(t, state))

	first, err := state.Restore()
	require.NoError(t, err)
	second, err := state.Restore()
	require.NoError(t, err)
	first.Active[1] = false
	delete(first.dead, 1)
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, participantStateBytes(t, secondState))
	require.Equal(t, before, participantStateBytes(t, state))
}

func TestTrackerStateRejectsCorruptionAtomically(t *testing.T) {
	t.Parallel()
	tracker := New()
	tracker.Active[1] = true
	tracker.fightActive = true
	tracker.known[1] = struct{}{}
	tracker.dead[1] = struct{}{}
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	valid := participantStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeTrackerState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}", `{"active":[],"fight_active":false,"known":[],"dead":[],"unknown":true}`,
		`{"active":null,"fight_active":false,"known":[],"dead":[]}`,
		`{"active":[],"fight_active":false,"known":[],"dead":[],"dead":[]}`,
		`{"active":[{"guid":1,"active":true,"active":false}],"fight_active":true,"known":[1],"dead":[]}`,
		`{"active":[{"guid":1}],"fight_active":true,"known":[1],"dead":[]}`,
		`{"active":[{"guid":1,"active":null}],"fight_active":true,"known":[1],"dead":[]}`,
		`{"active":[{"active":false}],"fight_active":true,"known":[1],"dead":[]}`,
		`{"active":[{"guid":null,"active":false}],"fight_active":true,"known":[1],"dead":[]}`,
		`{"active":[],"fight_active":true,"known":[],"dead":[1]}`,
		`{"active":[],"fight_active":true,"known":[1,1],"dead":[]}`,
	} {
		_, err := DecodeTrackerState(TrackerStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	var root map[string]any
	require.NoError(t, json.Unmarshal(valid, &root))
	root["dead"] = []any{float64(2)}
	corrupt, err := json.Marshal(root)
	require.NoError(t, err)
	decoded, err := DecodeTrackerState(TrackerStateVersion, corrupt)
	require.Error(t, err)
	require.Equal(t, true, tracker.Active[1])
	require.True(t, tracker.NoKnownParticipantsAlive())
	_, err = decoded.Restore()
	require.Error(t, err)
}

func TestTrackerStateCaptureRejectsIncompleteTracker(t *testing.T) {
	t.Parallel()
	var tracker *Tracker
	_, err := tracker.CaptureState()
	require.Error(t, err)
	tracker = &Tracker{}
	_, err = tracker.CaptureState()
	require.Error(t, err)
}
