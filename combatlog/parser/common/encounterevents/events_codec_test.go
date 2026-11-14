package encounterevents

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func encounterStateBytes(t *testing.T, state EncounterEventsState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func finalizedEventsStateBytes(t *testing.T, state EventsState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func eventDamage(at time.Time, amount int32) *messages.Damage {
	caster := guid.GUID(9)
	return &messages.Damage{MessageBase: messages.Base(at), Caster: &caster, Target: 1, Amount: amount}
}

func eventPosition(at time.Time, x float64) *messages.UnitPosition {
	return &messages.UnitPosition{MessageBase: messages.Base(at), Unit: 1, X: x, Y: 2}
}

func eventResources(at time.Time, health int64) *messages.UnitResources {
	return &messages.UnitResources{MessageBase: messages.Base(at), Unit: 1, CurrentHealth: health, MaximumHealth: 100, PowerType: types.ResourceMana, CurrentPower: 20, MaximumPower: 40}
}

func TestEncounterEventsStateContinuationAndSharedDamage(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 12, 18, 0, 0, 0, time.UTC)
	encounterID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	sharedDamage := eventDamage(start, 100)
	prefix := []messages.Message{
		sharedDamage,
		&messages.Slain{MessageBase: messages.Base(start.Add(time.Second)), Victim: 1, Attribution: sharedDamage},
		eventPosition(start.Add(2*time.Second), 10),
		eventResources(start.Add(3*time.Second), 90),
	}
	continuous := New(false)
	for _, message := range prefix {
		require.NoError(t, continuous.Process(message))
	}
	state, err := continuous.CaptureState(func(index int, damage *messages.Damage) (string, error) {
		require.Equal(t, 0, index)
		require.Same(t, sharedDamage, damage)
		return "/root/damage/0", nil
	})
	require.NoError(t, err)
	payload := encounterStateBytes(t, state)
	decoded, err := DecodeEncounterEventsState(EncounterEventsStateVersion, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore(func(path string) (*messages.Damage, error) {
		require.Equal(t, "/root/damage/0", path)
		return sharedDamage, nil
	})
	require.NoError(t, err)
	require.Same(t, sharedDamage, restored.Damage.pending[0].message)
	require.Equal(t, continuous.first, restored.first)
	require.Equal(t, continuous.cnter, restored.cnter)

	// Pending Damage remains shared and is encoded only at terminal encounter
	// finalization. Slain already owns its exact eager bytes from before mutation.
	sharedDamage.Amount = 999
	suffixContinuous := []messages.Message{
		eventPosition(start.Add(4*time.Second), 10),
		eventResources(start.Add(5*time.Second), 90),
		eventDamage(start.Add(6*time.Second), 200),
	}
	suffixRestored := []messages.Message{
		eventPosition(start.Add(4*time.Second), 10),
		eventResources(start.Add(5*time.Second), 90),
		eventDamage(start.Add(6*time.Second), 200),
	}
	for _, message := range suffixContinuous {
		require.NoError(t, continuous.Process(message))
	}
	for _, message := range suffixRestored {
		require.NoError(t, restored.Process(message))
	}
	require.NoError(t, continuous.Damage.SerializeBuffered(nil))
	require.NoError(t, restored.Damage.SerializeBuffered(nil))
	continuousEvents := NewEvents()
	restoredEvents := NewEvents()
	require.NoError(t, continuous.Finalize(continuousEvents, encounterID))
	require.NoError(t, restored.Finalize(restoredEvents, encounterID))
	require.Equal(t, continuousEvents, restoredEvents)
	require.Equal(t, payload, encounterStateBytes(t, state))
	require.Equal(t, payload, encounterStateBytes(t, decoded))

	finalState, err := restoredEvents.CaptureState()
	require.NoError(t, err)
	finalPayload := finalizedEventsStateBytes(t, finalState)
	finalDecoded, err := DecodeEventsState(EventsStateVersion, finalPayload)
	require.NoError(t, err)
	finalRestored, err := finalDecoded.Restore()
	require.NoError(t, err)
	require.Equal(t, restoredEvents, finalRestored)
	restoredEvents.Slain[0] ^= 0xff
	require.Equal(t, finalPayload, finalizedEventsStateBytes(t, finalState))
	require.Equal(t, finalPayload, finalizedEventsStateBytes(t, finalDecoded))
}

func TestEncounterEventsStateFinalizedLifecycle(t *testing.T) {
	t.Parallel()
	events := New(false)
	message := eventDamage(time.UnixMilli(1000), 10)
	require.NoError(t, events.Process(message))
	require.NoError(t, events.Damage.SerializeBuffered(nil))
	require.NoError(t, events.Finalize(NewEvents(), uuid.New()))
	state, err := events.CaptureState(nil)
	require.NoError(t, err)
	payload := encounterStateBytes(t, state)
	decoded, err := DecodeEncounterEventsState(EncounterEventsStateVersion, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore(nil)
	require.NoError(t, err)
	require.Error(t, restored.Process(eventDamage(time.UnixMilli(2000), 20)))
	require.Error(t, restored.Finalize(NewEvents(), uuid.New()))
}

func TestEncounterEventsStateFailedRestoreHasNoSideEffects(t *testing.T) {
	t.Parallel()
	events := New(false)
	damage := eventDamage(time.UnixMilli(1000), 10)
	require.NoError(t, events.Process(damage))
	state, err := events.CaptureState(func(int, *messages.Damage) (string, error) { return "/damage", nil })
	require.NoError(t, err)

	corrupt := state
	corrupt.value.First = corrupt.value.First.Add(time.Second)
	calls := 0
	restored, err := corrupt.Restore(func(string) (*messages.Damage, error) {
		calls++
		return damage, nil
	})
	require.Error(t, err)
	require.Nil(t, restored)
	require.Zero(t, calls, "invalid owner state must fail before resolving references")

	restored, err = state.Restore(func(string) (*messages.Damage, error) {
		calls++
		return nil, nil
	})
	require.Error(t, err)
	require.Nil(t, restored)
	require.Equal(t, 1, calls)
	require.Equal(t, int32(1), events.cnter)
	require.Same(t, damage, events.Damage.pending[0].message)
}

func TestEncounterEventsAndFinalizedEventsRejectCorruption(t *testing.T) {
	t.Parallel()
	events := New(false)
	state, err := events.CaptureState(nil)
	require.NoError(t, err)
	valid := encounterStateBytes(t, state)
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeEncounterEventsState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{"null", "{}", "{", string(valid) + " {}", `{"unknown":true}`} {
		_, err := DecodeEncounterEventsState(EncounterEventsStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}
	var root map[string]any
	require.NoError(t, json.Unmarshal(valid, &root))
	damageState := root["damage"].(map[string]any)["state"].(map[string]any)
	damageState["version"] = 999
	badVersion, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeEncounterEventsState(EncounterEventsStateVersion, badVersion)
	require.Error(t, err)

	final, err := NewEvents().CaptureState()
	require.NoError(t, err)
	finalValid := finalizedEventsStateBytes(t, final)
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeEventsState(version, finalValid)
		require.Error(t, err)
	}
	for _, payload := range []string{"null", "{}", string(finalValid) + " {}", `{"damage":null}`} {
		_, err := DecodeEventsState(EventsStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}
}

func TestPendingDamageStateJSON(t *testing.T) {
	t.Parallel()
	state := PendingDamageState{First: time.UnixMilli(1000), Count: 1, Entries: []PendingDamageReference{{Path: "/damage", Index: 4}}}
	payload, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodePendingDamageState(PendingDamageStateVersion, payload)
	require.NoError(t, err)
	require.Equal(t, state, decoded)
	for _, payload := range []string{"null", "{}", `{"first":"1970-01-01T00:00:01Z","count":1,"entries":null}`, `{"first":"1970-01-01T00:00:01Z","count":1,"entries":[{"path":"","index":0}]}`} {
		_, err := DecodePendingDamageState(PendingDamageStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}
}
