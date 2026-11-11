package encounterevents

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func positionStateBytes(t *testing.T, state PositionBuilderState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func positionStateMessages() []*messages.UnitPosition {
	start := time.Date(2026, time.November, 12, 12, 0, 0, 0, time.UTC)
	firstUnit := guid.GUID(1)
	secondUnit := guid.GUID(2)
	return []*messages.UnitPosition{
		{MessageBase: messages.Base(start), Unit: firstUnit, X: 10, Y: 20},
		{MessageBase: messages.Base(start.Add(time.Second)), Unit: firstUnit, X: 10, Y: 20},
		{MessageBase: messages.Base(start.Add(2 * time.Second)), Unit: secondUnit, X: 30, Y: 40},
		{MessageBase: messages.Base(start.Add(3 * time.Second)), Unit: firstUnit, X: 10, Y: 20},
		{MessageBase: messages.Base(start.Add(4 * time.Second)), Unit: firstUnit, X: 50, Y: 60},
	}
}

func TestPositionBuilderStateContinuation(t *testing.T) {
	t.Parallel()
	encounterID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	for split := 0; split <= len(positionStateMessages()); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := NewPositionBuilder()
			continuous.SetZero(positionStateMessages()[0].Date())
			for index, message := range positionStateMessages()[:split] {
				require.NoError(t, continuous.Add(message, int32(index)))
			}
			captured, err := continuous.CaptureState()
			require.NoError(t, err)
			payload := positionStateBytes(t, captured)
			decoded, err := DecodePositionBuilderState(PositionBuilderStateVersion, payload)
			require.NoError(t, err)
			restored, err := decoded.Restore()
			require.NoError(t, err)
			for index, message := range positionStateMessages()[split:] {
				require.NoError(t, continuous.Add(message, int32(split+index)))
			}
			for index, message := range positionStateMessages()[split:] {
				copy := *message
				require.NoError(t, restored.Add(&copy, int32(split+index)))
			}
			want, err := continuous.Finalize(encounterID)
			require.NoError(t, err)
			got, err := restored.Finalize(encounterID)
			require.NoError(t, err)
			require.Equal(t, want, got)
			require.Equal(t, payload, positionStateBytes(t, captured))
			require.Equal(t, payload, positionStateBytes(t, decoded))
		})
	}
}

func TestPositionBuilderStateDetachedAndFinalized(t *testing.T) {
	t.Parallel()
	builder := NewPositionBuilder()
	builder.SetZero(positionStateMessages()[0].Date())
	for index, message := range positionStateMessages()[:3] {
		require.NoError(t, builder.Add(message, int32(index)))
	}
	captured, err := builder.CaptureState()
	require.NoError(t, err)
	before := positionStateBytes(t, captured)
	builder.entries[0][0] ^= 0xff
	builder.runs[1] = unitPositionRun{}
	require.Equal(t, before, positionStateBytes(t, captured))

	first, err := captured.Restore()
	require.NoError(t, err)
	second, err := captured.Restore()
	require.NoError(t, err)
	first.entries[0][0] ^= 0xff
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, positionStateBytes(t, secondState))

	_, err = second.Finalize(uuid.New())
	require.NoError(t, err)
	finalized, err := second.CaptureState()
	require.NoError(t, err)
	finalizedPayload := positionStateBytes(t, finalized)
	decoded, err := DecodePositionBuilderState(PositionBuilderStateVersion, finalizedPayload)
	require.NoError(t, err)
	restored, err := decoded.Restore()
	require.NoError(t, err)
	require.Error(t, restored.Add(positionStateMessages()[0], 0))
	_, err = restored.Finalize(uuid.New())
	require.Error(t, err)
}

func TestPositionBuilderStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	builder := NewPositionBuilder()
	builder.SetZero(positionStateMessages()[0].Date())
	require.NoError(t, builder.Add(positionStateMessages()[0], 0))
	state, err := builder.CaptureState()
	require.NoError(t, err)
	valid := positionStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodePositionBuilderState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}", `{"unknown":true}`,
		`{"first":"2026-11-12T12:00:00Z","count":0,"done":false,"entries":null,"runs":null}`,
		`{"first":"2026-11-12T12:00:00Z","count":1,"done":true,"entries":[],"runs":null}`,
		`{"first":"2026-11-12T12:00:00Z","count":1,"done":false,"entries":["AA=="],"runs":[]}`,
		`{"first":"2026-11-12T12:00:00Z","count":0,"done":false,"entries":[],"runs":[],"runs":[]}`,
	} {
		_, err := DecodePositionBuilderState(PositionBuilderStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	var fields map[string]any
	require.NoError(t, json.Unmarshal(valid, &fields))
	runs := fields["runs"].([]any)
	runs[0].(map[string]any)["tail"] = 99
	badTail, err := json.Marshal(fields)
	require.NoError(t, err)
	_, err = DecodePositionBuilderState(PositionBuilderStateVersion, badTail)
	require.Error(t, err)
}
