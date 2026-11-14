package overviewmetrics

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func overviewStatePayload(t *testing.T, state TrackerState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func TestTrackerStateContinuationAndTopTen(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	player := guid.GUID(1)
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	continuous := NewTracker(units)
	for i := int32(1); i <= 6; i++ {
		name := "Ability"
		require.NoError(t, continuous.ProcessMessage(true, uuid.Nil, &messages.Damage{Target: player, Amount: i, SpellName: &name, SpellData: &chrondbc.Spell{ID: chrondbc.SpellID(i)}}))
	}
	environment := types.EnvironmentType("Falling")
	require.NoError(t, continuous.ProcessMessage(true, uuid.Nil, &messages.Damage{Target: player, Amount: 20, EnvironmentType: &environment}))

	state, err := continuous.CaptureState()
	require.NoError(t, err)
	payload := overviewStatePayload(t, state)
	decoded, err := DecodeTrackerState(TrackerStateVersion, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore(units)
	require.NoError(t, err)
	require.Same(t, units, restored.units)

	for i := int32(7); i <= 12; i++ {
		name := "Ability"
		continuousMessage := &messages.Damage{Target: player, Amount: i, SpellName: &name, SpellData: &chrondbc.Spell{ID: chrondbc.SpellID(i)}}
		restoredMessage := &messages.Damage{Target: player, Amount: i, SpellName: &name, SpellData: &chrondbc.Spell{ID: chrondbc.SpellID(i)}}
		require.NoError(t, continuous.ProcessMessage(true, uuid.Nil, continuousMessage))
		require.NoError(t, restored.ProcessMessage(true, uuid.Nil, restoredMessage))
	}
	require.Equal(t, continuous.Result(), restored.Result())
	require.Len(t, restored.Result(), DeadliestAbilityLimit)
	require.Equal(t, "Falling", restored.Result()[0].Name)
	require.Equal(t, int64(20), restored.Result()[0].Damage)
	require.Equal(t, payload, overviewStatePayload(t, state))
	require.Equal(t, payload, overviewStatePayload(t, decoded))

	continuous.abilities[abilityKey{spellID: 1}].Damage = 999
	require.NotEqual(t, continuous.Result(), restored.Result())
	require.Equal(t, payload, overviewStatePayload(t, state))
}

func TestTrackerStatePreservesDistinctNameAndEnvironmentBuckets(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	player := guid.GUID(1)
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	tracker := NewTracker(units)
	falling := types.EnvironmentType("Falling")
	drowning := types.EnvironmentType("Drowning")
	for _, environment := range []*types.EnvironmentType{nil, &falling, &drowning} {
		require.NoError(t, tracker.ProcessMessage(true, uuid.Nil, &messages.Damage{Target: player, Amount: 10, EnvironmentType: environment}))
	}
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	restored, err := state.Restore(units)
	require.NoError(t, err)
	require.Equal(t, tracker.Result(), restored.Result())
	require.Len(t, restored.abilities, 3)
}

func TestTrackerStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	player := guid.GUID(1)
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	tracker := NewTracker(units)
	name := "Ability"
	require.NoError(t, tracker.ProcessMessage(true, uuid.Nil, &messages.Damage{Target: player, Amount: 10, SpellName: &name, SpellData: &chrondbc.Spell{ID: 1}}))
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	payload := overviewStatePayload(t, state)
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeTrackerState(version, payload)
		require.Error(t, err)
	}
	for _, corrupt := range []string{"null", "{}", `{"abilities":null}`, string(payload) + " {}", `{"abilities":[],"abilities":[]}`, `{"unknown":[]}`} {
		_, err := DecodeTrackerState(TrackerStateVersion, []byte(corrupt))
		require.Error(t, err, corrupt)
	}
	var root map[string]any
	require.NoError(t, json.Unmarshal(payload, &root))
	ability := root["abilities"].([]any)[0].(map[string]any)
	ability["damage"] = float64(0)
	invalid, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeTrackerState(TrackerStateVersion, invalid)
	require.ErrorContains(t, err, "invalid overview metric totals")

	invalidState := state
	invalidState.abilities = nil
	candidate, err := invalidState.Restore(units)
	require.Error(t, err)
	require.Nil(t, candidate)
	candidate, err = state.Restore(nil)
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Len(t, tracker.Result(), 1)
}
