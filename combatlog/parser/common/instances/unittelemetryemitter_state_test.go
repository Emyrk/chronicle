package instances

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestTelemetryStateSuffix(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	chars := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	source := newUnitTelemetryEmitter(chars)
	var originalOutput, restoredOutput []messages.Message
	source.emit = func(m messages.Message) { originalOutput = append(originalOutput, m) }
	z := 12.5
	floor := int32(2)
	level := int32(60)
	ilvl := int32(100)
	position := &messages.UnitPosition{MessageBase: messages.Base(at), Unit: 1, X: 1, Y: 2, Z: &z, Floor: &floor, HasFacing: true, Facing: 3}
	position.MarkActivityStart("cached", 1)
	resource := &messages.UnitResources{MessageBase: messages.Base(at), Unit: 1, CurrentHealth: 100, MaximumHealth: 200, UnitLevel: &level, AverageItemLevel: &ilvl}
	require.NoError(t, source.ProcessMessage(false, uuid.Nil, position))
	require.NoError(t, source.ProcessMessage(false, uuid.Nil, resource))
	for _, duringFight := range []bool{false, true} {
		if duringFight {
			source.FightStarted(uuid.Nil, messages.TimedOut(at.Add(time.Second)))
		}
		state, e := source.CaptureState()
		require.NoError(t, e)
		data, e := state.Encode()
		require.NoError(t, e)
		state, e = DecodeUnitTelemetryEmitterState(UnitTelemetryEmitterStateVersion, data)
		require.NoError(t, e)
		restored := new(UnitTelemetryEmitter)
		before := len(restoredOutput)
		require.NoError(t, restored.RestoreState(state, chars, func(m messages.Message) { restoredOutput = append(restoredOutput, m) }))
		require.Len(t, restoredOutput, before)
		require.Same(t, chars, restored.characters)
		require.Equal(t, source.positions[1].CaptureState(), restored.positions[1].CaptureState())
		require.NotSame(t, source.positions[1].Z, restored.positions[1].Z)
		require.NotSame(t, source.resources[1].UnitLevel, restored.resources[1].UnitLevel)
		*restored.positions[1].Z = 99
		require.NotEqual(t, *restored.positions[1].Z, *source.positions[1].Z)
		*restored.positions[1].Z = *source.positions[1].Z
		require.Error(t, restored.RestoreState(state, nil, func(messages.Message) {}))
		require.Same(t, chars, restored.characters)
		originalOutput = nil
		restoredOutput = nil
		for _, emitter := range []*UnitTelemetryEmitter{source, restored} {
			if !duringFight {
				emitter.FightStarted(uuid.Nil, messages.TimedOut(at.Add(time.Second)))
			}
			emitter.emitCached(1, messages.TimedOut(at.Add(2*time.Second))) // dedup current fight
			require.NoError(t, emitter.ProcessMessage(true, uuid.Nil, &messages.Slain{Victim: 1}))
			emitter.emitCached(1, messages.TimedOut(at.Add(3*time.Second)))
			require.NoError(t, emitter.ProcessMessage(true, uuid.Nil, &messages.Resurrection{Target: 1}))
			require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, position))
			require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, resource))
			emitter.FightEnded(uuid.Nil, nil)
			emitter.FightStarted(uuid.Nil, messages.TimedOut(at.Add(4*time.Second)))
		}
		require.Equal(t, originalOutput, restoredOutput)
		after, e := state.Encode()
		require.NoError(t, e)
		require.Equal(t, data, after)
	}
	require.Empty(t, chars.DB().Info)
	require.Zero(t, chars.All.Len())
}
func TestTelemetryStateRejectsMalformed(t *testing.T) {
	t.Parallel()
	source := newUnitTelemetryEmitter(nil)
	s, e := source.CaptureState()
	require.NoError(t, e)
	data, e := s.Encode()
	require.NoError(t, e)
	var fields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(data, &fields))
	for _, key := range []string{"positions", "resources", "dead", "emitted_position", "emitted_resource"} {
		original := fields[key]
		fields[key] = json.RawMessage(`null`)
		bad, e := json.Marshal(fields)
		require.NoError(t, e)
		_, e = DecodeUnitTelemetryEmitterState(UnitTelemetryEmitterStateVersion, bad)
		require.Error(t, e)
		fields[key] = original
	}
	for _, bad := range []string{`null`, `{}`, string(data) + ` {}`} {
		_, e = DecodeUnitTelemetryEmitterState(UnitTelemetryEmitterStateVersion, []byte(bad))
		require.Error(t, e)
	}
	source.positions[guid.GUID(1)] = messages.UnitPosition{Unit: 2}
	_, e = source.CaptureState()
	require.Error(t, e)
}
