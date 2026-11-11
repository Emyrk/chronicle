package raidgroups

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func raidGroupStateBytes(t *testing.T, state State) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func raidGroupMessages() []messages.Message {
	start := time.Date(2026, time.November, 11, 12, 0, 0, 0, time.UTC)
	return []messages.Message{
		&messages.RaidGroup{MessageBase: messages.Base(start), Groups: [8][5]guid.GUID{{1, 2}}},
		&messages.RaidGroup{MessageBase: messages.Base(start), Groups: [8][5]guid.GUID{{3, 4}}},
		&messages.RaidGroup{MessageBase: messages.Base(start.Add(time.Minute)), Groups: [8][5]guid.GUID{{5, 6}}},
	}
}

func TestStateResume(t *testing.T) {
	t.Parallel()
	for split := 0; split <= len(raidGroupMessages()); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := New()
			original := raidGroupMessages()
			resumedMessages := raidGroupMessages()
			for _, message := range original[:split] {
				continuous.Process(message)
			}
			captured, err := continuous.CaptureState()
			require.NoError(t, err)
			payload := raidGroupStateBytes(t, captured)
			decoded, err := DecodeState(StateVersion, payload)
			require.NoError(t, err)
			restored, err := decoded.Restore()
			require.NoError(t, err)
			for _, message := range original[split:] {
				continuous.Process(message)
			}
			for _, message := range resumedMessages[split:] {
				restored.Process(message)
			}
			continuousState, err := continuous.CaptureState()
			require.NoError(t, err)
			restoredState, err := restored.CaptureState()
			require.NoError(t, err)
			require.Equal(t, raidGroupStateBytes(t, continuousState), raidGroupStateBytes(t, restoredState))
			require.Equal(t, payload, raidGroupStateBytes(t, captured))
			require.Equal(t, payload, raidGroupStateBytes(t, decoded))
		})
	}
}

func TestStatePreservesOrderAndIsDetached(t *testing.T) {
	t.Parallel()
	tracker := New()
	for _, message := range raidGroupMessages()[:2] {
		tracker.Process(message)
	}
	captured, err := tracker.CaptureState()
	require.NoError(t, err)
	before := raidGroupStateBytes(t, captured)

	tracker.observations[0].Composition[0][0] = 99
	require.Equal(t, before, raidGroupStateBytes(t, captured))

	first, err := captured.Restore()
	require.NoError(t, err)
	second, err := captured.Restore()
	require.NoError(t, err)
	latest, ok := first.LatestAt(time.Date(2026, time.November, 11, 12, 0, 0, 0, time.UTC))
	require.True(t, ok)
	require.Equal(t, guid.GUID(3), latest.Composition[0][0])
	first.observations[0].Composition[0][0] = 88
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, raidGroupStateBytes(t, secondState))
	require.Equal(t, before, raidGroupStateBytes(t, captured))
}

func TestStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	tracker := New()
	tracker.Process(raidGroupMessages()[0])
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	valid := raidGroupStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}", `{"unknown":true}`, `{"observations":{},"unknown":true}`,
		`{"observations":[null]}`, `{"observations":[{"at":null,"composition":[]}]}`,
		`{"observations":[{"at":"2026-11-11T12:00:00Z","composition":[]}]}`,
		`{"observations":[],"observations":[]}`,
	} {
		_, err := DecodeState(StateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	var root map[string]any
	require.NoError(t, json.Unmarshal(valid, &root))
	observations := root["observations"].([]any)
	observation := observations[0].(map[string]any)
	composition := observation["composition"].([]any)
	composition[0] = composition[0].([]any)[:4]
	short, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeState(StateVersion, short)
	require.Error(t, err)
}

func TestCaptureStateRejectsNilTracker(t *testing.T) {
	t.Parallel()
	var tracker *Tracker
	_, err := tracker.CaptureState()
	require.Error(t, err)
}
