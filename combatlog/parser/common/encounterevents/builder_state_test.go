package encounterevents_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func eagerStateBytes(t *testing.T, state encounterevents.EagerBuilderState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func slainMessage(at time.Time, victim guid.GUID, attribution *messages.Damage) *messages.Slain {
	return &messages.Slain{
		MessageBase: messages.Base(at),
		Victim:      victim,
		Attribution: attribution,
	}
}

func addSlain(t *testing.T, builder *encounterevents.Builder[*messages.Slain, *chronicleproto.Slain], message *messages.Slain, index int32) {
	t.Helper()
	require.NoError(t, encounterevents.AddToBuilder(builder, message, index, types2proto.Slain))
}

func TestEagerBuilderStateContinuesExactSlainBytes(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 11, 18, 0, 0, 0, time.UTC)
	encounterID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	caster := guid.GUID(9)
	damage := &messages.Damage{
		MessageBase: messages.Base(start.Add(time.Second)),
		Caster:      &caster,
		Target:      guid.GUID(2),
		Amount:      100,
	}
	prefix := slainMessage(start.Add(2*time.Second), 2, damage)
	suffix := slainMessage(start.Add(3*time.Second), 3, nil)

	continuous := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
	continuous.SetZero(start)
	addSlain(t, continuous, prefix, 0)
	captured, err := continuous.CaptureEagerState()
	require.NoError(t, err)
	payload := eagerStateBytes(t, captured)
	decoded, err := encounterevents.DecodeEagerBuilderState(encounterevents.EagerBuilderStateVersion, payload)
	require.NoError(t, err)
	resumed, err := encounterevents.RestoreEagerBuilder[*messages.Slain, *chronicleproto.Slain](decoded)
	require.NoError(t, err)

	// Slain was eagerly encoded. Mutating its shared Damage attribution later must
	// not change the stored prefix or cause restore to regenerate that event.
	damage.Amount = 999
	*damage.Caster = 99
	addSlain(t, continuous, suffix, 1)
	addSlain(t, resumed, slainMessage(suffix.Date(), suffix.Victim, nil), 1)
	continuousBytes, err := continuous.Finalize(encounterID)
	require.NoError(t, err)
	resumedBytes, err := resumed.Finalize(encounterID)
	require.NoError(t, err)
	require.Equal(t, continuousBytes, resumedBytes)

	expected := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
	expected.SetZero(start)
	expectedDamage := &messages.Damage{
		MessageBase: messages.Base(start.Add(time.Second)),
		Caster:      new(guid.GUID),
		Target:      2,
		Amount:      100,
	}
	*expectedDamage.Caster = 9
	addSlain(t, expected, slainMessage(prefix.Date(), prefix.Victim, expectedDamage), 0)
	addSlain(t, expected, slainMessage(suffix.Date(), suffix.Victim, nil), 1)
	expectedBytes, err := expected.Finalize(encounterID)
	require.NoError(t, err)
	require.Equal(t, expectedBytes, resumedBytes)
	require.Equal(t, payload, eagerStateBytes(t, captured))
	require.Equal(t, payload, eagerStateBytes(t, decoded))
}

func TestEagerBuilderStateDetachedRestore(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 11, 19, 0, 0, 0, time.UTC)
	builder := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
	builder.SetZero(start)
	addSlain(t, builder, slainMessage(start, 1, nil), 0)
	captured, err := builder.CaptureEagerState()
	require.NoError(t, err)
	before := eagerStateBytes(t, captured)

	first, err := encounterevents.RestoreEagerBuilder[*messages.Slain, *chronicleproto.Slain](captured)
	require.NoError(t, err)
	second, err := encounterevents.RestoreEagerBuilder[*messages.Slain, *chronicleproto.Slain](captured)
	require.NoError(t, err)
	addSlain(t, builder, slainMessage(start.Add(time.Second), 2, nil), 1)
	addSlain(t, first, slainMessage(start.Add(2*time.Second), 3, nil), 2)

	secondState, err := second.CaptureEagerState()
	require.NoError(t, err)
	require.Equal(t, before, eagerStateBytes(t, secondState))
	require.Equal(t, before, eagerStateBytes(t, captured))
}

func TestEagerBuilderStatePreservesFinalizedBehavior(t *testing.T) {
	t.Parallel()
	builder := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
	builder.SetZero(time.UnixMilli(1000))
	addSlain(t, builder, slainMessage(time.UnixMilli(1000), 1, nil), 0)
	_, err := builder.Finalize(uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"))
	require.NoError(t, err)

	captured, err := builder.CaptureEagerState()
	require.NoError(t, err)
	payload := eagerStateBytes(t, captured)
	require.Contains(t, string(payload), `"done":true`)
	require.Contains(t, string(payload), `"data":null`)
	decoded, err := encounterevents.DecodeEagerBuilderState(encounterevents.EagerBuilderStateVersion, payload)
	require.NoError(t, err)
	restored, err := encounterevents.RestoreEagerBuilder[*messages.Slain, *chronicleproto.Slain](decoded)
	require.NoError(t, err)

	err = encounterevents.AddToBuilder(restored, slainMessage(time.UnixMilli(2000), 2, nil), 1, types2proto.Slain)
	require.ErrorContains(t, err, "already finalized")
	_, err = restored.Finalize(uuid.New())
	require.ErrorContains(t, err, "already finalized")
	restoredState, err := restored.CaptureEagerState()
	require.NoError(t, err)
	require.Equal(t, payload, eagerStateBytes(t, restoredState))
}

func TestEagerBuilderStateRejectsInvalidBuildersAndPayloads(t *testing.T) {
	t.Parallel()
	var nilBuilder *encounterevents.Builder[*messages.Slain, *chronicleproto.Slain]
	_, err := nilBuilder.CaptureEagerState()
	require.Error(t, err)
	buffered := encounterevents.NewBufferedBuilder[*messages.Damage, *chronicleproto.Damage]()
	_, err = buffered.CaptureEagerState()
	require.Error(t, err)
	_, err = encounterevents.RestoreEagerBuilder[*messages.Slain, *chronicleproto.Slain](encounterevents.EagerBuilderState{})
	require.Error(t, err)

	builder := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
	builder.SetZero(time.UnixMilli(1000))
	addSlain(t, builder, slainMessage(time.UnixMilli(1000), 1, nil), 0)
	state, err := builder.CaptureEagerState()
	require.NoError(t, err)
	valid := eagerStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := encounterevents.DecodeEagerBuilderState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}", `{"unknown":true}`,
		`{"first":"1970-01-01T00:00:01Z","count":1,"done":false,"data":null}`,
		`{"first":"1970-01-01T00:00:01Z","count":1,"done":true,"data":""}`,
		`{"first":"1970-01-01T00:00:01Z","count":-1,"done":false,"data":""}`,
		`{"first":"1970-01-01T00:00:01Z","count":1,"done":false,"data":""}`,
		`{"first":"1970-01-01T00:00:01Z","count":1,"done":false,"data":"AgE="}`,
		`{"first":"1970-01-01T00:00:01Z","count":1,"done":false,"data":"%%%"}`,
		`{"first":"1970-01-01T00:00:01Z","count":0,"done":false,"data":"","data":""}`,
	} {
		_, err := encounterevents.DecodeEagerBuilderState(encounterevents.EagerBuilderStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	var fields map[string]any
	require.NoError(t, json.Unmarshal(valid, &fields))
	for _, name := range []string{"first", "count", "done", "data"} {
		copyFields := make(map[string]any, len(fields))
		for key, value := range fields {
			copyFields[key] = value
		}
		delete(copyFields, name)
		payload, err := json.Marshal(copyFields)
		require.NoError(t, err)
		_, err = encounterevents.DecodeEagerBuilderState(encounterevents.EagerBuilderStateVersion, payload)
		require.Error(t, err, name)
	}
}
