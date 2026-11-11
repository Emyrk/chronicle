package encounterevents

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/require"
)

func telemetryStateBytes(t *testing.T, state TelemetryDeduplicatorState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func telemetryResource(unit guid.GUID, health int64) *messages.UnitResources {
	return &messages.UnitResources{
		Unit: unit, CurrentHealth: health, MaximumHealth: 100, Absorb: 5,
		PowerType: types.ResourceMana, CurrentPower: 20, MaximumPower: 40,
		AttackPower: 50, SpellPower: 60, Armor: 70,
	}
}

func TestTelemetryDeduplicatorStateContinuation(t *testing.T) {
	t.Parallel()
	original := newUnitTelemetryDeduplicator()
	require.False(t, original.duplicate(telemetryResource(1, 90)))
	state, err := original.CaptureState()
	require.NoError(t, err)
	payload := telemetryStateBytes(t, state)
	decoded, err := DecodeTelemetryDeduplicatorState(TelemetryDeduplicatorStateVersion, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore()
	require.NoError(t, err)

	for _, message := range []*messages.UnitResources{telemetryResource(1, 90), telemetryResource(1, 80), telemetryResource(1, 80), telemetryResource(2, 70)} {
		require.Equal(t, original.duplicate(message), restored.duplicate(telemetryResource(message.Unit, message.CurrentHealth)))
	}
	originalState, err := original.CaptureState()
	require.NoError(t, err)
	restoredState, err := restored.CaptureState()
	require.NoError(t, err)
	require.Equal(t, telemetryStateBytes(t, originalState), telemetryStateBytes(t, restoredState))
	require.Equal(t, payload, telemetryStateBytes(t, state))
	require.Equal(t, payload, telemetryStateBytes(t, decoded))
}

func TestTelemetryDeduplicatorStateDetached(t *testing.T) {
	t.Parallel()
	dedup := newUnitTelemetryDeduplicator()
	require.False(t, dedup.duplicate(telemetryResource(1, 90)))
	state, err := dedup.CaptureState()
	require.NoError(t, err)
	before := telemetryStateBytes(t, state)
	dedup.resources[1] = unitResourcesSnapshot{}
	require.Equal(t, before, telemetryStateBytes(t, state))

	first, err := state.Restore()
	require.NoError(t, err)
	second, err := state.Restore()
	require.NoError(t, err)
	first.resources[1] = unitResourcesSnapshot{}
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, telemetryStateBytes(t, secondState))
}

func TestTelemetryDeduplicatorStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeTelemetryDeduplicatorState(version, []byte(`{"resources":[]}`))
		require.Error(t, err)
	}
	entry := `{"unit":"0x0000000000000001","current_health":1,"maximum_health":2,"absorb":3,"power_type":0,"current_power":4,"maximum_power":5,"attack_power":6,"spell_power":7,"armor":8}`
	for _, payload := range []string{
		"null", "{}", "{", `{"resources":null}`, `{"resources":[],"unknown":true}`,
		`{"resources":[null]}`, `{"resources":[` + entry + `,` + entry + `]}`,
		`{"resources":[` + entry[:len(entry)-1] + `,"armor":null}]}`,
		`{"resources":[],"resources":[]}`,
	} {
		_, err := DecodeTelemetryDeduplicatorState(TelemetryDeduplicatorStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}
	var nilDedup *unitTelemetryDeduplicator
	_, err := nilDedup.CaptureState()
	require.Error(t, err)
	_, err = (&unitTelemetryDeduplicator{}).CaptureState()
	require.Error(t, err)
	_, err = (TelemetryDeduplicatorState{resources: []unitResourcesValue{{Unit: 1}, {Unit: 1}}}).Restore()
	require.Error(t, err)
}
