package vehicles

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func vehicleStateBytes(t *testing.T, state State) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func vehicleStateMessages() []messages.Message {
	vehicle := guid.GUID(0xF15000812400008F)
	first := guid.GUID(0x000000000000000B)
	second := guid.GUID(0x000000000000000C)
	observed := time.UnixMilli(9000)
	message := func(action messages.VehicleControlAction, controller guid.GUID, at int64, ordinal uint64) *messages.VehicleControl {
		result := vehicleMessage(action, vehicle, controller, at, ordinal)
		result.ObservedAt = observed.Add(time.Duration(ordinal) * time.Millisecond)
		result.Synthetic = ordinal == 2
		return result
	}
	return []messages.Message{
		versionMessage("first", time.UnixMilli(1000)),
		message(messages.VehicleControlAssign, first, 2000, 0),
		message(messages.VehicleControlRelease, first, 3000, 1),
		versionMessage("second", time.UnixMilli(4000)),
		message(messages.VehicleControlAssign, second, 5000, 2),
		message(messages.VehicleControlRelease, second, 6000, 3),
	}
}

func TestStateResume(t *testing.T) {
	t.Parallel()
	for split := 0; split <= len(vehicleStateMessages()); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := New()
			original := vehicleStateMessages()
			resumedMessages := vehicleStateMessages()
			for _, message := range original[:split] {
				continuous.Process(message)
			}
			captured, err := continuous.CaptureState()
			require.NoError(t, err)
			payload := vehicleStateBytes(t, captured)
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
			require.Equal(t, vehicleStateBytes(t, continuousState), vehicleStateBytes(t, restoredState))
			require.Equal(t, continuous.MetadataForRange(time.Time{}, time.UnixMilli(10000)), restored.MetadataForRange(time.Time{}, time.UnixMilli(10000)))
			require.Equal(t, payload, vehicleStateBytes(t, captured))
			require.Equal(t, payload, vehicleStateBytes(t, decoded))
		})
	}
}

func TestStatePreservesAliasesOrderAndIsDetached(t *testing.T) {
	t.Parallel()
	tracker := New()
	messages := vehicleStateMessages()
	for _, message := range messages[:5] {
		tracker.Process(message)
	}
	captured, err := tracker.CaptureState()
	require.NoError(t, err)
	before := vehicleStateBytes(t, captured)

	tracker.sessions[0].id = "changed"
	*tracker.sessions[0].endedAt = time.UnixMilli(99)
	tracker.sessions[0].changes[0].VehicleName = "changed"
	require.Equal(t, before, vehicleStateBytes(t, captured))

	first, err := captured.Restore()
	require.NoError(t, err)
	second, err := captured.Restore()
	require.NoError(t, err)
	require.Same(t, first.sessions[len(first.sessions)-1], first.current)
	require.Equal(t, time.UnixMilli(9002), first.current.changes[0].ObservedAt)
	require.True(t, first.current.changes[0].IsSynthetic())
	first.current.changes[0].VehicleName = "mutated"
	first.sessions[0].id = "mutated"
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, vehicleStateBytes(t, secondState))
	require.Equal(t, before, vehicleStateBytes(t, captured))

	first.Process(vehicleStateMessages()[5])
	require.Len(t, first.current.changes, 2)
	require.Len(t, second.current.changes, 1)
}

func TestStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	tracker := New()
	for _, message := range vehicleStateMessages()[:5] {
		tracker.Process(message)
	}
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	valid := vehicleStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}", `{"unknown":true}`,
		`{"sessions":null,"current_session":0}`, `{"sessions":[],"current_session":0}`,
		`{"sessions":[],"current_session":null,"current_session":null}`,
		`{"sessions":[null],"current_session":0}`,
	} {
		_, err := DecodeState(StateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	var root map[string]any
	require.NoError(t, json.Unmarshal(valid, &root))
	sessions := root["sessions"].([]any)
	for field, value := range map[string]any{
		"action":       "invalid",
		"vehicle_guid": "0x0000000000000001",
		"timestamp":    nil,
		"observed_at":  "broken",
		"unknown":      true,
	} {
		copyRoot := cloneJSON(t, root)
		copySessions := copyRoot["sessions"].([]any)
		copyCurrent := copySessions[len(copySessions)-1].(map[string]any)
		copyChange := copyCurrent["changes"].([]any)[0].(map[string]any)
		copyChange[field] = value
		payload, err := json.Marshal(copyRoot)
		require.NoError(t, err)
		_, err = DecodeState(StateVersion, payload)
		require.Error(t, err, field)
	}

	for field, value := range map[string]any{"current_session": nil, "sessions": []any{sessions[len(sessions)-1]}} {
		copyRoot := cloneJSON(t, root)
		copyRoot[field] = value
		payload, err := json.Marshal(copyRoot)
		require.NoError(t, err)
		_, err = DecodeState(StateVersion, payload)
		require.Error(t, err, field)
	}
}

func cloneJSON(t *testing.T, value map[string]any) map[string]any {
	t.Helper()
	payload, err := json.Marshal(value)
	require.NoError(t, err)
	var result map[string]any
	require.NoError(t, json.Unmarshal(payload, &result))
	return result
}

func TestCaptureStateRejectsInvalidAliases(t *testing.T) {
	t.Parallel()
	var tracker *Tracker
	_, err := tracker.CaptureState()
	require.Error(t, err)

	tracker = New()
	tracker.sessions = []*session{{}}
	tracker.current = &session{}
	_, err = tracker.CaptureState()
	require.Error(t, err)

	tracker.current = tracker.sessions[0]
	tracker.sessions[0].changes = []*messages.VehicleControl{nil}
	_, err = tracker.CaptureState()
	require.Error(t, err)
}
