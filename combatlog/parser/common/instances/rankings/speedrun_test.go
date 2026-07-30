package rankings

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// makeCreatureGUID builds a creature GUID with the given entry and spawn IDs.
// Layout: high=0xF130, entry in bits 24-47, spawn in bits 0-23.
func makeCreatureGUID(entryID uint32, spawnID uint32) guid.GUID {
	return guid.GUID(0xF130000000000000 | (uint64(entryID) << 24) | uint64(spawnID))
}

func msg(t time.Time) messages.Message {
	return messages.TimedOut(t)
}

var t0 = time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

// stubChar implements the subset of character.Character needed by ActivityChange.
type stubChar struct {
	id        guid.GUID
	active    bool
	endState  period.EndState
	hasPeriod bool
}

func (s *stubChar) ID() guid.GUID                       { return s.id }
func (s *stubChar) IsActive() bool                      { return s.active }
func (s *stubChar) String() string                      { return s.id.String() }
func (s *stubChar) Died(string, messages.Message)       {}
func (s *stubChar) Process(messages.Message) error      { return nil }
func (s *stubChar) Periods() []period.Period            { return nil }
func (s *stubChar) RecentlySlain(messages.Message) bool { return false }
func (s *stubChar) LastEndState() period.EndState       { return period.EndStateNone }
func (s *stubChar) SetPeriodHook(period.Hook)           {}
func (s *stubChar) CurrentPeriod() (period.Period, bool) {
	if !s.hasPeriod {
		return period.Period{}, false
	}
	return period.Period{EndState: s.endState}, true
}

func singleBossRules(name string, entryID uint32) SpeedrunRules {
	return SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: name, EntryIDs: []uint32{entryID}, Count: 1},
		},
	}
}

func TestSpeedrunTracker_ActivityChange_SlainSatisfiesRequirement(t *testing.T) {
	t.Parallel()
	tracker := NewSpeedrunTracker(singleBossRules("Boss", 100), nil, nil)

	c := &stubChar{
		id:        makeCreatureGUID(100, 1),
		active:    false,
		endState:  period.EndStateSlain,
		hasPeriod: true,
	}
	tracker.ActivityChange(msg(t0), c)

	assert.Equal(t, 0, tracker.remaining)
	assert.True(t, tracker.state[0].satisfied)
	require.Len(t, tracker.state[0].kills, 1)
	assert.Equal(t, uint32(100), tracker.state[0].kills[0].EntryID)
}

func TestSpeedrunTracker_ActivityChange_ResetDoesNotSatisfy(t *testing.T) {
	t.Parallel()
	tracker := NewSpeedrunTracker(singleBossRules("Boss", 100), nil, nil)

	c := &stubChar{
		id:        makeCreatureGUID(100, 1),
		active:    false,
		endState:  period.EndStateReset,
		hasPeriod: true,
	}
	tracker.ActivityChange(msg(t0), c)

	assert.Equal(t, 1, tracker.remaining)
	assert.False(t, tracker.state[0].satisfied)
	assert.Empty(t, tracker.state[0].kills)
}

func TestSpeedrunTracker_ActivityChange_ActiveCharacterIgnored(t *testing.T) {
	t.Parallel()
	tracker := NewSpeedrunTracker(singleBossRules("Boss", 100), nil, nil)

	c := &stubChar{
		id:        makeCreatureGUID(100, 1),
		active:    true,
		endState:  period.EndStateSlain,
		hasPeriod: true,
	}
	tracker.ActivityChange(msg(t0), c)

	assert.Equal(t, 1, tracker.remaining)
}

func TestSpeedrunTracker_ActivityChange_UntrackedEntryIgnored(t *testing.T) {
	t.Parallel()
	tracker := NewSpeedrunTracker(singleBossRules("Boss", 100), nil, nil)

	c := &stubChar{
		id:        makeCreatureGUID(999, 1),
		active:    false,
		endState:  period.EndStateSlain,
		hasPeriod: true,
	}
	tracker.ActivityChange(msg(t0), c)

	assert.Equal(t, 1, tracker.remaining)
}

func TestSpeedrunTracker_ActivityChange_DuplicateGUIDIgnored(t *testing.T) {
	t.Parallel()
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Trolls", EntryIDs: []uint32{100}, Count: 2},
		},
	}
	tracker := NewSpeedrunTracker(rules, nil, nil)

	c := &stubChar{
		id:        makeCreatureGUID(100, 1),
		active:    false,
		endState:  period.EndStateSlain,
		hasPeriod: true,
	}
	tracker.ActivityChange(msg(t0), c)
	tracker.ActivityChange(msg(t0.Add(time.Second)), c)

	assert.Equal(t, 1, tracker.remaining)
	require.Len(t, tracker.state[0].kills, 1, "same GUID should only be counted once")
}

func TestSpeedrunTracker_ActivityChange_CountNRequiresNDistinctGUIDs(t *testing.T) {
	t.Parallel()
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Trolls", EntryIDs: []uint32{100}, Count: 3},
		},
	}
	tracker := NewSpeedrunTracker(rules, nil, nil)

	for i := uint32(1); i <= 3; i++ {
		c := &stubChar{
			id:        makeCreatureGUID(100, i),
			active:    false,
			endState:  period.EndStateSlain,
			hasPeriod: true,
		}
		tracker.ActivityChange(msg(t0.Add(time.Duration(i)*time.Second)), c)
	}

	assert.Equal(t, 0, tracker.remaining)
	assert.True(t, tracker.state[0].satisfied)
	require.Len(t, tracker.state[0].kills, 3)
}

func TestSpeedrunTracker_ActivityChange_MultipleEntryIDsSameRequirement(t *testing.T) {
	t.Parallel()
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Trolls", EntryIDs: []uint32{100, 101}, Count: 2},
		},
	}
	tracker := NewSpeedrunTracker(rules, nil, nil)

	c1 := &stubChar{id: makeCreatureGUID(100, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}
	c2 := &stubChar{id: makeCreatureGUID(101, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}

	tracker.ActivityChange(msg(t0), c1)
	tracker.ActivityChange(msg(t0.Add(time.Second)), c2)

	assert.Equal(t, 0, tracker.remaining)
	assert.True(t, tracker.state[0].satisfied)
	require.Len(t, tracker.state[0].kills, 2)
}

func TestSpeedrunTracker_FightStarted_RecordsFirstFightOnly(t *testing.T) {
	t.Parallel()
	tracker := NewSpeedrunTracker(singleBossRules("Boss", 100), nil, nil)

	first := t0
	second := t0.Add(5 * time.Minute)

	tracker.FightStarted(uuid.New(), msg(first))
	tracker.FightStarted(uuid.New(), msg(second))

	assert.Equal(t, first, tracker.startTime)
}

func TestSpeedrunTracker_FightEnded_QualifiesOnlyWhenAllSatisfied(t *testing.T) {
	t.Parallel()
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "A", EntryIDs: []uint32{100}, Count: 1},
			{Name: "B", EntryIDs: []uint32{200}, Count: 1},
		},
	}
	tracker := NewSpeedrunTracker(rules, nil, nil)
	tracker.FightStarted(uuid.New(), msg(t0))

	// Kill first boss
	c1 := &stubChar{id: makeCreatureGUID(100, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c1)
	tracker.FightEnded(uuid.New(), msg(t0.Add(time.Minute)))
	assert.False(t, tracker.completed, "should not complete with 1 of 2 satisfied")

	// Kill second boss
	c2 := &stubChar{id: makeCreatureGUID(200, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(2*time.Minute)), c2)
	tracker.FightEnded(uuid.New(), msg(t0.Add(2*time.Minute)))
	assert.True(t, tracker.completed)
	assert.Equal(t, t0.Add(2*time.Minute), tracker.completionTime)
}

func TestSpeedrunTracker_CompletedIgnoresSubsequentKills(t *testing.T) {
	t.Parallel()
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{100}, Count: 1},
			{Name: "Extra", EntryIDs: []uint32{200}, Count: 1},
		},
	}
	tracker := NewSpeedrunTracker(rules, nil, nil)
	tracker.FightStarted(uuid.New(), msg(t0))

	// Satisfy both
	c1 := &stubChar{id: makeCreatureGUID(100, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}
	c2 := &stubChar{id: makeCreatureGUID(200, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c1, c2)
	tracker.FightEnded(uuid.New(), msg(t0.Add(time.Minute)))
	require.True(t, tracker.completed)

	// Another kill should be ignored
	c3 := &stubChar{id: makeCreatureGUID(100, 2), active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(5*time.Minute)), c3)

	assert.Len(t, tracker.state[0].kills, 1, "completed tracker should ignore new kills")
}

func TestSpeedrunTracker_ReentryGap(t *testing.T) {
	t.Parallel()

	raid := NewSpeedrunTracker(singleBossRules("Boss", 100), nil, nil)
	assert.Equal(t, DefaultReentryGap, raid.ReentryGap())

	dungeonRules := singleBossRules("Boss", 100)
	dungeonRules.ReentryGap = DungeonReentryGap
	dungeon := NewSpeedrunTracker(dungeonRules, nil, nil)
	assert.Equal(t, DungeonReentryGap, dungeon.ReentryGap())
}

func TestSpeedrunTracker_Result_ProofForEveryRequirement(t *testing.T) {
	t.Parallel()
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "A", EntryIDs: []uint32{100}, Count: 1},
			{Name: "B", EntryIDs: []uint32{200}, Count: 1},
		},
	}
	tracker := NewSpeedrunTracker(rules, nil, nil)
	tracker.FightStarted(uuid.New(), msg(t0))

	// Only kill A
	c := &stubChar{id: makeCreatureGUID(100, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c)
	tracker.FightEnded(uuid.New(), msg(t0.Add(time.Minute)))

	result := tracker.Result()
	assert.False(t, result.Qualified)
	require.Len(t, result.Proof, 2)

	assert.True(t, result.Proof[0].Satisfied)
	require.Len(t, result.Proof[0].Kills, 1)
	assert.Equal(t, "A", result.Proof[0].Requirement.Name)

	assert.False(t, result.Proof[1].Satisfied)
	assert.Empty(t, result.Proof[1].Kills)
	assert.Equal(t, "B", result.Proof[1].Requirement.Name)
}

func TestSpeedrunTracker_Result_QualifiedRun(t *testing.T) {
	t.Parallel()
	tracker := NewSpeedrunTracker(singleBossRules("Boss", 100), nil, nil)

	startTime := t0
	endTime := t0.Add(30 * time.Minute)

	tracker.FightStarted(uuid.New(), msg(startTime))
	c := &stubChar{id: makeCreatureGUID(100, 1), active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(endTime), c)
	tracker.FightEnded(uuid.New(), msg(endTime))

	result := tracker.Result()
	assert.True(t, result.Qualified)
	assert.Equal(t, startTime, result.StartTime)
	assert.Equal(t, endTime, result.CompletionTime)
	assert.Equal(t, 30*time.Minute, result.Duration)
	require.Len(t, result.Proof, 1)
	assert.True(t, result.Proof[0].Satisfied)
}
