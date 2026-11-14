package rankings

import (
	"encoding/json"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func speedrunStateBytes(t *testing.T, state SpeedrunTrackerState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func speedrunResultBytes(t *testing.T, tracker *SpeedrunTracker) []byte {
	t.Helper()
	payload, err := json.Marshal(tracker.Result())
	require.NoError(t, err)
	return payload
}

func speedrunStateRules() SpeedrunRules {
	return SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Opening Boss", EntryIDs: []uint32{100}, Count: 1, Category: SpeedrunCategoryBosses},
			{Name: "Final Boss", EntryIDs: []uint32{200}, Count: 1, Category: SpeedrunCategoryBosses},
			{Name: "Trailing Trash", EntryIDs: []uint32{10, 11}, Count: 2, Category: SpeedrunCategoryTrash},
		},
		RankedStartAfterRequirement: "Opening Boss",
		ReentryGap:                  DungeonReentryGap,
	}
}

func slainSpeedrunCharacter(entry, spawn uint32) *stubChar {
	return &stubChar{id: makeCreatureGUID(entry, spawn), endState: period.EndStateSlain, hasPeriod: true}
}

func TestSpeedrunTrackerStateContinuationProofAndTimings(t *testing.T) {
	t.Parallel()
	rules := speedrunStateRules()
	units := unitdb.New()
	engagement := NewEngagementTracker(units)
	tracker := NewSpeedrunTracker(rules, units, engagement)

	wipeID := uuid.MustParse("10000000-0000-0000-0000-000000000001")
	openingID := uuid.MustParse("10000000-0000-0000-0000-000000000002")
	finalID := uuid.MustParse("10000000-0000-0000-0000-000000000003")
	trashID := uuid.MustParse("10000000-0000-0000-0000-000000000004")
	start := time.Date(2026, time.November, 12, 4, 0, 0, 0, time.UTC)
	finalBoss := makeCreatureGUID(200, 1)

	tracker.FightStarted(wipeID, msg(start))
	engagement.results[wipeID] = &EngagementResult{Engaged: map[guid.GUID]UnitCategory{finalBoss: CategoryCreature}}
	tracker.FightEnded(wipeID, msg(start.Add(time.Minute)))

	openingStart := start.Add(5 * time.Minute)
	openingEnd := openingStart.Add(2 * time.Minute)
	tracker.FightStarted(openingID, msg(openingStart))
	tracker.ActivityChange(msg(openingStart.Add(time.Minute)), slainSpeedrunCharacter(100, 1))
	tracker.FightEnded(openingID, msg(openingEnd))

	finalStart := start.Add(10 * time.Minute)
	tracker.FightStarted(finalID, msg(finalStart))
	tracker.ActivityChange(msg(finalStart.Add(time.Minute)), slainSpeedrunCharacter(200, 1))

	captured, err := tracker.CaptureState()
	require.NoError(t, err)
	payload := speedrunStateBytes(t, captured)
	decoded, err := DecodeSpeedrunTrackerState(SpeedrunTrackerStateVersion, payload)
	require.NoError(t, err)
	engagementResults := len(engagement.results)
	unitCount := len(units.Info)
	restored, err := decoded.Restore(rules, units, engagement)
	require.NoError(t, err)
	require.Same(t, units, restored.units)
	require.Same(t, engagement, restored.engagement)
	require.Len(t, engagement.results, engagementResults)
	require.Len(t, units.Info, unitCount)

	finalEnd := finalStart.Add(2 * time.Minute)
	tracker.FightEnded(finalID, msg(finalEnd))
	restored.FightEnded(finalID, msg(finalEnd))
	trashStart := start.Add(20 * time.Minute)
	trashEnd := trashStart.Add(3 * time.Minute)
	for _, current := range []*SpeedrunTracker{tracker, restored} {
		current.FightStarted(trashID, msg(trashStart))
		// Delivered proof order is semantic and need not be chronological.
		current.ActivityChange(msg(trashStart.Add(2*time.Minute)), slainSpeedrunCharacter(10, 1))
		current.ActivityChange(msg(trashStart.Add(time.Minute)), slainSpeedrunCharacter(11, 1))
		current.FightEnded(trashID, msg(trashEnd))
	}

	require.Equal(t, speedrunResultBytes(t, tracker), speedrunResultBytes(t, restored))
	result := restored.Result()
	require.True(t, result.Qualified)
	require.Equal(t, start, result.StartTime)
	require.Equal(t, finalEnd, result.CompletionTime)
	require.Equal(t, openingEnd, result.RankedStartTime)
	require.Equal(t, finalEnd, result.RankedCompletionTime)
	require.Equal(t, start, result.BossToBossStartTime)
	require.Equal(t, finalEnd, result.BossToBossCompletionTime)
	require.Equal(t, []KillRecord{
		{EntryID: 10, GUID: makeCreatureGUID(10, 1), Timestamp: trashStart.Add(2 * time.Minute)},
		{EntryID: 11, GUID: makeCreatureGUID(11, 1), Timestamp: trashStart.Add(time.Minute)},
	}, result.Proof[2].Kills)
	completedAt, completed := restored.BossesCompletedAt()
	require.True(t, completed)
	require.Equal(t, finalEnd, completedAt)

	continuousState, err := tracker.CaptureState()
	require.NoError(t, err)
	restoredState, err := restored.CaptureState()
	require.NoError(t, err)
	require.Equal(t, speedrunStateBytes(t, continuousState), speedrunStateBytes(t, restoredState))
	require.Equal(t, payload, speedrunStateBytes(t, captured))
	require.Equal(t, payload, speedrunStateBytes(t, decoded))
}

func TestSpeedrunTrackerStatePreservesNilAndEmptyProof(t *testing.T) {
	t.Parallel()
	rules := SpeedrunRules{Requirements: []SpeedrunRequirement{
		{Name: "Nil", EntryIDs: []uint32{100}, Count: 1},
		{Name: "Empty", EntryIDs: []uint32{200}, Count: 1},
	}}
	tracker := NewSpeedrunTracker(rules, nil, nil)
	tracker.state[1].kills = []KillRecord{}
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	require.Nil(t, state.value.Requirements[0].Kills)
	require.NotNil(t, state.value.Requirements[1].Kills)
	decoded, err := DecodeSpeedrunTrackerState(SpeedrunTrackerStateVersion, speedrunStateBytes(t, state))
	require.NoError(t, err)
	restored, err := decoded.Restore(rules, nil, nil)
	require.NoError(t, err)
	require.Nil(t, restored.state[0].kills)
	require.NotNil(t, restored.state[1].kills)
}

func TestSpeedrunTrackerStateDetachedAndConfigVerified(t *testing.T) {
	t.Parallel()
	rules := singleBossRules("Boss", 100)
	tracker := NewSpeedrunTracker(rules, nil, nil)
	tracker.FightStarted(uuid.New(), msg(t0))
	tracker.ActivityChange(msg(t0.Add(time.Minute)), slainSpeedrunCharacter(100, 1))
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	before := speedrunStateBytes(t, state)

	tracker.state[0].kills[0].EntryID = 999
	tracker.seenGUIDs[makeCreatureGUID(999, 1)] = struct{}{}
	require.Equal(t, before, speedrunStateBytes(t, state))

	first, err := state.Restore(rules, nil, nil)
	require.NoError(t, err)
	second, err := state.Restore(rules, nil, nil)
	require.NoError(t, err)
	first.state[0].kills[0].EntryID = 999
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, speedrunStateBytes(t, secondState))

	changed := rules
	changed.Requirements = slices.Clone(rules.Requirements)
	changed.Requirements[0].Count = 2
	candidate, err := state.Restore(changed, nil, nil)
	require.Error(t, err)
	require.Nil(t, candidate)
	changed = rules
	changed.ReentryGap = DungeonReentryGap
	candidate, err = state.Restore(changed, nil, nil)
	require.Error(t, err)
	require.Nil(t, candidate)
}

func TestSpeedrunTrackerStateRejectsCorruptionAndDependencyMismatch(t *testing.T) {
	t.Parallel()
	rules := singleBossRules("Boss", 100)
	units := unitdb.New()
	engagement := NewEngagementTracker(units)
	tracker := NewSpeedrunTracker(rules, units, engagement)
	tracker.FightStarted(uuid.New(), msg(t0))
	tracker.ActivityChange(msg(t0.Add(time.Minute)), slainSpeedrunCharacter(100, 1))
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	valid := speedrunStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeSpeedrunTrackerState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}",
		`{"config_sha256":"00","has_units":true,"has_engagement":true,"requirements":[],"remaining":0,"bosses_remaining":0,"seen_guids":[],"boss_completion_time":"0001-01-01T00:00:00Z","start_time":"0001-01-01T00:00:00Z","completion_time":"0001-01-01T00:00:00Z","completed":false,"current_fight_start":"0001-01-01T00:00:00Z","current_fight_satisfied_boss":false,"current_fight_satisfied_ranked_start":false,"ranked_start_time":"0001-01-01T00:00:00Z","ranked_completion_time":"0001-01-01T00:00:00Z","boss_to_boss_start_time":"0001-01-01T00:00:00Z","boss_to_boss_completion_time":"0001-01-01T00:00:00Z"}`,
		`{"config_sha256":null,"has_units":true}`,
	} {
		_, err := DecodeSpeedrunTrackerState(SpeedrunTrackerStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	var root map[string]any
	require.NoError(t, json.Unmarshal(valid, &root))
	requirement := root["requirements"].([]any)[0].(map[string]any)
	delete(requirement, "satisfied")
	corrupt, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeSpeedrunTrackerState(SpeedrunTrackerStateVersion, corrupt)
	require.Error(t, err)

	require.NoError(t, json.Unmarshal(valid, &root))
	kill := root["requirements"].([]any)[0].(map[string]any)["kills"].([]any)[0].(map[string]any)
	kill["entry_id"] = float64(101)
	corrupt, err = json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeSpeedrunTrackerState(SpeedrunTrackerStateVersion, corrupt)
	require.Error(t, err, "GUID-derived entry mismatch must fail before restore")

	invalid, err := DecodeSpeedrunTrackerState(SpeedrunTrackerStateVersion, valid)
	require.NoError(t, err)
	invalid.value.Requirements[0].Kills[0].EntryID = 101
	candidate, err := invalid.Restore(rules, units, engagement)
	require.Error(t, err)
	require.Nil(t, candidate)
	invalid, err = DecodeSpeedrunTrackerState(SpeedrunTrackerStateVersion, valid)
	require.NoError(t, err)
	invalid.value.Remaining = 99
	candidate, err = invalid.Restore(rules, units, engagement)
	require.Error(t, err)
	require.Nil(t, candidate)
	candidate, err = state.Restore(rules, nil, engagement)
	require.Error(t, err)
	require.Nil(t, candidate)
	candidate, err = state.Restore(rules, units, nil)
	require.Error(t, err)
	require.Nil(t, candidate)
	original, err := tracker.CaptureState()
	require.NoError(t, err)
	require.Equal(t, valid, speedrunStateBytes(t, original))
}

func TestSpeedrunTrackerStateCaptureRejectsIncompleteTracker(t *testing.T) {
	t.Parallel()
	var tracker *SpeedrunTracker
	_, err := tracker.CaptureState()
	require.Error(t, err)
	tracker = &SpeedrunTracker{}
	_, err = tracker.CaptureState()
	require.Error(t, err)
}
