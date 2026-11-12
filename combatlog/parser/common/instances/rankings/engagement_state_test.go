package rankings

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
)

func engagementStateBytes(t *testing.T, state EngagementTrackerState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func engagementMessages(start time.Time, tank, healer, pet, boss guid.GUID) []messages.Message {
	return []messages.Message{
		&messages.Damage{MessageBase: messages.Base(start.Add(time.Second)), Caster: &tank, Target: boss, Amount: 100},
		&messages.Heal{MessageBase: messages.Base(start.Add(2 * time.Second)), Caster: healer, Target: tank, Amount: 50},
		&messages.Damage{MessageBase: messages.Base(start.Add(3 * time.Second)), Caster: &pet, Target: boss, Amount: 25},
	}
}

func engagementStateUnits() (*unitdb.Units, guid.GUID, guid.GUID, guid.GUID, guid.GUID) {
	units := newTestUnits()
	boss := makeCreatureGUID(100, 1)
	tank := makePlayerGUID(1)
	healer := makePlayerGUID(2)
	pet := makePetGUID(200, 1)
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[tank] = unitinfo.Info{Guid: tank, Name: "Tank", IsPlayer: true, CanCooperate: true}
	units.Info[healer] = unitinfo.Info{Guid: healer, Name: "Healer", IsPlayer: true, CanCooperate: true}
	units.Info[pet] = unitinfo.Info{Guid: pet, Name: "Pet", CanCooperate: true, Owner: &tank}
	return units, tank, healer, pet, boss
}

func TestEngagementTrackerStateContinuation(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 12, 3, 0, 0, 0, time.UTC)
	previousID := uuid.MustParse("55555555-5555-5555-5555-555555555555")
	fightID := uuid.MustParse("66666666-6666-6666-6666-666666666666")

	for split := 0; split <= 3; split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			units, tank, healer, pet, boss := engagementStateUnits()
			continuous := NewEngagementTracker(units)
			continuous.FightStarted(previousID, nil)
			previous := &messages.Damage{MessageBase: messages.Base(start.Add(-time.Minute)), Caster: &healer, Target: boss, Amount: 1}
			require.NoError(t, continuous.ProcessMessage(true, previousID, previous))
			continuous.FightEnded(previousID, previous)
			continuous.FightStarted(fightID, nil)
			prefix := engagementMessages(start, tank, healer, pet, boss)
			for _, message := range prefix[:split] {
				require.NoError(t, continuous.ProcessMessage(true, fightID, message))
			}

			captured, err := continuous.CaptureState()
			require.NoError(t, err)
			payload := engagementStateBytes(t, captured)
			decoded, err := DecodeEngagementTrackerState(EngagementTrackerStateVersion, payload)
			require.NoError(t, err)
			infoCount := len(units.Info)
			restored, err := decoded.Restore(units)
			require.NoError(t, err)
			require.Same(t, units, restored.units)
			require.Len(t, units.Info, infoCount)

			continuousSuffix := engagementMessages(start, tank, healer, pet, boss)
			restoredSuffix := engagementMessages(start, tank, healer, pet, boss)
			for _, message := range continuousSuffix[split:] {
				require.NoError(t, continuous.ProcessMessage(true, fightID, message))
			}
			for _, message := range restoredSuffix[split:] {
				require.NoError(t, restored.ProcessMessage(true, fightID, message))
			}
			continuous.FightEnded(fightID, messages.TimedOut(start.Add(4*time.Second)))
			restored.FightEnded(fightID, messages.TimedOut(start.Add(4*time.Second)))
			require.Equal(t, continuous.EncounterEngaged(previousID), restored.EncounterEngaged(previousID))
			require.Equal(t, continuous.EncounterEngaged(fightID), restored.EncounterEngaged(fightID))
			require.Equal(t, continuous.AllEngagedPlayers(), restored.AllEngagedPlayers())
			continuousState, err := continuous.CaptureState()
			require.NoError(t, err)
			restoredState, err := restored.CaptureState()
			require.NoError(t, err)
			require.Equal(t, engagementStateBytes(t, continuousState), engagementStateBytes(t, restoredState))
			require.Equal(t, payload, engagementStateBytes(t, captured))
			require.Equal(t, payload, engagementStateBytes(t, decoded))
		})
	}
}

func TestEngagementTrackerStatePreservesInitializationAndUnknownCategory(t *testing.T) {
	t.Parallel()
	units := newTestUnits()
	tracker := NewEngagementTracker(units)
	beforeFight, err := tracker.CaptureState()
	require.NoError(t, err)
	require.Nil(t, beforeFight.value.Categories)
	require.Nil(t, beforeFight.value.Engaged)
	restoredBefore, err := beforeFight.Restore(units)
	require.NoError(t, err)
	require.Nil(t, restoredBefore.categories)
	require.Nil(t, restoredBefore.engaged)

	tracker.FightStarted(uuid.New(), nil)
	tracker.categories[0] = CategoryUnknown
	active, err := tracker.CaptureState()
	require.NoError(t, err)
	require.NotNil(t, active.value.Categories)
	require.NotNil(t, active.value.Engaged)
	decoded, err := DecodeEngagementTrackerState(EngagementTrackerStateVersion, engagementStateBytes(t, active))
	require.NoError(t, err)
	restoredActive, err := decoded.Restore(units)
	require.NoError(t, err)
	require.Equal(t, CategoryUnknown, restoredActive.categories[0])
	require.NotNil(t, restoredActive.engaged)
}

func TestEngagementTrackerStateDetachedRestore(t *testing.T) {
	t.Parallel()
	units, tank, _, _, boss := engagementStateUnits()
	fightID := uuid.MustParse("77777777-7777-7777-7777-777777777777")
	tracker := NewEngagementTracker(units)
	tracker.FightStarted(fightID, nil)
	message := &messages.Damage{Caster: &tank, Target: boss, Amount: 1}
	require.NoError(t, tracker.ProcessMessage(true, fightID, message))
	tracker.FightEnded(fightID, message)
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	before := engagementStateBytes(t, state)

	tracker.categories[tank] = CategoryObject
	tracker.results[fightID].Engaged[tank] = CategoryObject
	require.Equal(t, before, engagementStateBytes(t, state))

	first, err := state.Restore(units)
	require.NoError(t, err)
	second, err := state.Restore(units)
	require.NoError(t, err)
	first.categories[tank] = CategoryObject
	first.results[fightID].Engaged[tank] = CategoryObject
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, engagementStateBytes(t, secondState))
	require.Equal(t, before, engagementStateBytes(t, state))
}

func TestEngagementTrackerStateRejectsCorruptionAtomically(t *testing.T) {
	t.Parallel()
	units, tank, _, _, boss := engagementStateUnits()
	fightID := uuid.MustParse("88888888-8888-8888-8888-888888888888")
	tracker := NewEngagementTracker(units)
	tracker.FightStarted(fightID, nil)
	require.NoError(t, tracker.ProcessMessage(true, fightID, &messages.Damage{Caster: &tank, Target: boss, Amount: 1}))
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	valid := engagementStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeEngagementTrackerState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}", `{"categories":[],"engaged":[],"results":[],"unknown":true}`,
		`{"categories":[],"engaged":[],"results":null}`, `{"categories":[],"engaged":[],"results":[],"results":[]}`,
		`{"categories":[{"guid":1}],"engaged":[],"results":[]}`,
		`{"categories":[{"guid":1,"category":null}],"engaged":[],"results":[]}`,
		`{"categories":[{"guid":1,"category":1}],"engaged":[2],"results":[]}`,
		`{"categories":null,"engaged":[],"results":[]}`,
	} {
		_, err := DecodeEngagementTrackerState(EngagementTrackerStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	invalid := state
	invalid.value.Engaged = append(invalid.value.Engaged, makePlayerGUID(99))
	candidate, err := invalid.Restore(units)
	require.Error(t, err)
	require.Nil(t, candidate)
	candidate, err = state.Restore(nil)
	require.Error(t, err)
	require.Nil(t, candidate)
	original, err := tracker.CaptureState()
	require.NoError(t, err)
	require.Equal(t, valid, engagementStateBytes(t, original))

	var root map[string]any
	require.NoError(t, json.Unmarshal(valid, &root))
	root["categories"].([]any)[0].(map[string]any)["category"] = 99.0
	corrupt, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeEngagementTrackerState(EngagementTrackerStateVersion, corrupt)
	require.Error(t, err)
}

func TestEngagementTrackerStateCaptureRejectsIncompleteTracker(t *testing.T) {
	t.Parallel()
	var tracker *EngagementTracker
	_, err := tracker.CaptureState()
	require.Error(t, err)
	tracker = &EngagementTracker{}
	_, err = tracker.CaptureState()
	require.Error(t, err)
}
