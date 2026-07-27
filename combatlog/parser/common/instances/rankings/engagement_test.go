package rankings

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
)

// makePlayerGUID builds a player GUID with the given ID.
// Player GUIDs have high bits 0x0000.
func makePlayerGUID(id uint64) guid.GUID {
	return guid.GUID(id)
}

// makePetGUID builds a pet GUID with the given entry and spawn IDs.
// Pet GUIDs have high bits 0xF140.
func makePetGUID(entryID uint32, spawnID uint32) guid.GUID {
	return guid.GUID(0xF140000000000000 | (uint64(entryID) << 24) | uint64(spawnID))
}

func newTestUnits() *unitdb.Units {
	return &unitdb.Units{
		Info:         make(map[guid.GUID]unitinfo.Info),
		Players:      make(map[guid.GUID]combatant.Combatant),
		PlayerByName: make(map[string]guid.GUID),
		Possessed:    make(map[guid.GUID]unitdb.PossessionState),
	}
}

func TestEngagementTracker_BasicEngagement(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	tank := makePlayerGUID(1)

	// Boss is hostile, tank is a player.
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[tank] = unitinfo.Info{Guid: tank, Name: "Tank", IsPlayer: true, CanCooperate: true, Level: 60}

	tracker := NewEngagementTracker(units)
	eid := uuid.New()

	tracker.FightStarted(eid, msg(t0))

	// Tank damages boss.
	_ = tracker.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &tank,
		Target:      boss,
		Amount:      100,
	})

	tracker.FightEnded(eid, msg(t0.Add(2*time.Second)))

	engaged := tracker.EncounterEngaged(eid)
	require.NotNil(t, engaged)
	assert.Contains(t, engaged, boss)
	assert.Contains(t, engaged, tank)
	assert.Equal(t, CategoryCreature, engaged[boss])
	assert.Equal(t, CategoryPlayer, engaged[tank])
}

func TestEngagementTracker_HealerEngagedTransitively(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	tank := makePlayerGUID(1)
	healer := makePlayerGUID(2)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[tank] = unitinfo.Info{Guid: tank, Name: "Tank", IsPlayer: true, CanCooperate: true, Level: 60}
	units.Info[healer] = unitinfo.Info{Guid: healer, Name: "Healer", IsPlayer: true, CanCooperate: true, Level: 60}

	tracker := NewEngagementTracker(units)
	eid := uuid.New()

	tracker.FightStarted(eid, msg(t0))

	// Tank damages boss.
	_ = tracker.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &tank,
		Target:      boss,
		Amount:      100,
	})

	// Healer heals tank.
	_ = tracker.ProcessMessage(true, eid, &messages.Heal{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(2 * time.Second)},
		Caster:      healer,
		Target:      tank,
		Amount:      50,
	})

	tracker.FightEnded(eid, msg(t0.Add(3*time.Second)))

	engaged := tracker.EncounterEngaged(eid)
	assert.Contains(t, engaged, healer, "healer should be engaged transitively")
	assert.Equal(t, CategoryPlayer, engaged[healer])
}

func TestEngagementTracker_AFKPlayerNotEngaged(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	tank := makePlayerGUID(1)
	afk := makePlayerGUID(2)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[tank] = unitinfo.Info{Guid: tank, Name: "Tank", IsPlayer: true, CanCooperate: true, Level: 60}
	units.Info[afk] = unitinfo.Info{Guid: afk, Name: "AFKPlayer", IsPlayer: true, CanCooperate: true, Level: 50}

	tracker := NewEngagementTracker(units)
	eid := uuid.New()

	tracker.FightStarted(eid, msg(t0))

	// Only tank damages boss; AFK player does nothing.
	_ = tracker.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &tank,
		Target:      boss,
		Amount:      100,
	})

	tracker.FightEnded(eid, msg(t0.Add(2*time.Second)))

	engaged := tracker.EncounterEngaged(eid)
	assert.Contains(t, engaged, tank)
	assert.NotContains(t, engaged, afk, "AFK player should not be engaged")
}

func TestEngagementTracker_PetOwnerEngagedViaOwnership(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	hunter := makePlayerGUID(1)
	pet := makePetGUID(200, 1)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[hunter] = unitinfo.Info{Guid: hunter, Name: "Hunter", IsPlayer: true, CanCooperate: true, Level: 60}
	units.Info[pet] = unitinfo.Info{Guid: pet, Name: "Cat", CanCooperate: true, Owner: &hunter}

	tracker := NewEngagementTracker(units)
	eid := uuid.New()

	tracker.FightStarted(eid, msg(t0))

	// Pet damages boss (hunter doesn't directly).
	_ = tracker.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &pet,
		Target:      boss,
		Amount:      50,
	})

	tracker.FightEnded(eid, msg(t0.Add(2*time.Second)))

	engaged := tracker.EncounterEngaged(eid)
	assert.Contains(t, engaged, pet, "pet should be engaged")
	assert.Contains(t, engaged, hunter, "hunter should be engaged via pet ownership")
}

func TestEngagementTracker_AllEngagedPlayers_UnionAcrossEncounters(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss1 := makeCreatureGUID(100, 1)
	boss2 := makeCreatureGUID(200, 1)
	player1 := makePlayerGUID(1)
	player2 := makePlayerGUID(2)

	units.Info[boss1] = unitinfo.Info{Guid: boss1, Name: "Boss1", CanCooperate: false}
	units.Info[boss2] = unitinfo.Info{Guid: boss2, Name: "Boss2", CanCooperate: false}
	units.Info[player1] = unitinfo.Info{Guid: player1, Name: "P1", IsPlayer: true, CanCooperate: true, Level: 60}
	units.Info[player2] = unitinfo.Info{Guid: player2, Name: "P2", IsPlayer: true, CanCooperate: true, Level: 55}

	tracker := NewEngagementTracker(units)

	// Encounter 1: player1 fights boss1.
	eid1 := uuid.New()
	tracker.FightStarted(eid1, msg(t0))
	_ = tracker.ProcessMessage(true, eid1, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &player1,
		Target:      boss1,
		Amount:      100,
	})
	tracker.FightEnded(eid1, msg(t0.Add(2*time.Second)))

	// Encounter 2: player2 fights boss2.
	eid2 := uuid.New()
	tracker.FightStarted(eid2, msg(t0.Add(5*time.Minute)))
	_ = tracker.ProcessMessage(true, eid2, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(5*time.Minute + time.Second)},
		Caster:      &player2,
		Target:      boss2,
		Amount:      100,
	})
	tracker.FightEnded(eid2, msg(t0.Add(5*time.Minute+2*time.Second)))

	allPlayers := tracker.AllEngagedPlayers()
	assert.Contains(t, allPlayers, player1)
	assert.Contains(t, allPlayers, player2)
}

func TestEngagementTracker_InactiveMessageIgnored(t *testing.T) {
	t.Parallel()
	units := newTestUnits()
	tracker := NewEngagementTracker(units)
	eid := uuid.New()

	// Don't call FightStarted — message sent during inactive period.
	err := tracker.ProcessMessage(false, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0},
		Caster:      func() *guid.GUID { g := makePlayerGUID(1); return &g }(),
		Target:      makeCreatureGUID(100, 1),
		Amount:      100,
	})
	require.NoError(t, err)

	// No results should exist.
	assert.Empty(t, tracker.AllEngagedPlayers())
}

// --- Level range integration tests ---

func TestSpeedrunTracker_LevelRange_AllPlayersInRange(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	player := makePlayerGUID(1)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Player", IsPlayer: true, CanCooperate: true, Level: 60}

	engagement := NewEngagementTracker(units)
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{100}, Count: 1},
		},
		LevelRange: &LevelRangeRequirement{MinLevel: 60, MaxLevel: 60},
	}
	tracker := NewSpeedrunTracker(rules, units, engagement, nil)

	eid := uuid.New()

	// Simulate fight: engagement tracker and speedrun tracker both process.
	engagement.FightStarted(eid, msg(t0))
	tracker.FightStarted(eid, msg(t0))

	dmg := &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &player,
		Target:      boss,
		Amount:      100,
	}
	_ = engagement.ProcessMessage(true, eid, dmg)

	// Boss killed.
	c := &stubChar{id: boss, active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c)

	engagement.FightEnded(eid, msg(t0.Add(time.Minute)))
	tracker.FightEnded(eid, msg(t0.Add(time.Minute)))

	result := tracker.Result()
	require.NotNil(t, result.LevelRange)
	assert.True(t, result.LevelRange.Satisfied)
	assert.Empty(t, result.LevelRange.Violators)
	assert.True(t, result.Qualified)
}

func TestSpeedrunTracker_LevelRange_ViolatorDisqualifies(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	player60 := makePlayerGUID(1)
	player55 := makePlayerGUID(2)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[player60] = unitinfo.Info{Guid: player60, Name: "GoodPlayer", IsPlayer: true, CanCooperate: true, Level: 60}
	units.Info[player55] = unitinfo.Info{Guid: player55, Name: "LowPlayer", IsPlayer: true, CanCooperate: true, Level: 55}

	engagement := NewEngagementTracker(units)
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{100}, Count: 1},
		},
		LevelRange: &LevelRangeRequirement{MinLevel: 60, MaxLevel: 60},
	}
	tracker := NewSpeedrunTracker(rules, units, engagement, nil)

	eid := uuid.New()

	engagement.FightStarted(eid, msg(t0))
	tracker.FightStarted(eid, msg(t0))

	// Both players damage boss.
	for _, p := range []guid.GUID{player60, player55} {
		p := p
		_ = engagement.ProcessMessage(true, eid, &messages.Damage{
			MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
			Caster:      &p,
			Target:      boss,
			Amount:      100,
		})
	}

	// Boss killed.
	c := &stubChar{id: boss, active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c)

	engagement.FightEnded(eid, msg(t0.Add(time.Minute)))
	tracker.FightEnded(eid, msg(t0.Add(time.Minute)))

	result := tracker.Result()
	require.NotNil(t, result.LevelRange)
	assert.False(t, result.LevelRange.Satisfied)
	assert.False(t, result.Qualified, "should be disqualified due to level violation")
	require.Len(t, result.LevelRange.Violators, 1)
	assert.Equal(t, "LowPlayer", result.LevelRange.Violators[0].PlayerName)
	assert.Equal(t, int32(55), result.LevelRange.Violators[0].Level)
}

func TestSpeedrunTracker_LevelRange_IgnoresZeroGUID(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	player := makePlayerGUID(1)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Player", IsPlayer: true, CanCooperate: true, Level: 60}

	engagement := NewEngagementTracker(units)
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{100}, Count: 1},
		},
		LevelRange: &LevelRangeRequirement{MinLevel: 0, MaxLevel: 60},
	}
	tracker := NewSpeedrunTracker(rules, units, engagement, nil)

	eid := uuid.New()
	engagement.FightStarted(eid, msg(t0))
	tracker.FightStarted(eid, msg(t0))

	p := player
	_ = engagement.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &p,
		Target:      boss,
		Amount:      100,
	})

	zero := guid.GUID(0)
	_ = engagement.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(2 * time.Second)},
		Caster:      &zero,
		Target:      player,
		Amount:      100,
	})

	c := &stubChar{id: boss, active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c)

	engagement.FightEnded(eid, msg(t0.Add(time.Minute)))
	tracker.FightEnded(eid, msg(t0.Add(time.Minute)))

	result := tracker.Result()
	require.NotNil(t, result.LevelRange)
	assert.True(t, result.LevelRange.Satisfied)
	assert.True(t, result.Qualified)
	assert.Empty(t, result.LevelRange.Violators)
}

func TestSpeedrunTracker_LevelRange_UsesEngagedCombatantInfo(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	player := makePlayerGUID(1)
	level := int32(70)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Players[player] = combatant.Combatant{Guid: player, Name: "OverleveledPlayer", Level: &level}

	engagement := NewEngagementTracker(units)
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{100}, Count: 1},
		},
		LevelRange: &LevelRangeRequirement{MinLevel: 0, MaxLevel: 60},
	}
	tracker := NewSpeedrunTracker(rules, units, engagement, nil)

	eid := uuid.New()
	engagement.FightStarted(eid, msg(t0))
	tracker.FightStarted(eid, msg(t0))

	p := player
	_ = engagement.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &p,
		Target:      boss,
		Amount:      100,
	})

	c := &stubChar{id: boss, active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c)

	engagement.FightEnded(eid, msg(t0.Add(time.Minute)))
	tracker.FightEnded(eid, msg(t0.Add(time.Minute)))

	result := tracker.Result()
	require.NotNil(t, result.LevelRange)
	assert.False(t, result.LevelRange.Satisfied)
	assert.False(t, result.Qualified, "an engaged player must use level data from COMBATANT_INFO")
	require.Len(t, result.LevelRange.Violators, 1)
	assert.Equal(t, "OverleveledPlayer", result.LevelRange.Violators[0].PlayerName)
	assert.Equal(t, int32(70), result.LevelRange.Violators[0].Level)
}

func TestSpeedrunTracker_LevelRange_AFKPlayerNotChecked(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	tank := makePlayerGUID(1)
	afk := makePlayerGUID(2)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[tank] = unitinfo.Info{Guid: tank, Name: "Tank", IsPlayer: true, CanCooperate: true, Level: 60}
	units.Info[afk] = unitinfo.Info{Guid: afk, Name: "AFKLowbie", IsPlayer: true, CanCooperate: true, Level: 30}

	engagement := NewEngagementTracker(units)
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{100}, Count: 1},
		},
		LevelRange: &LevelRangeRequirement{MinLevel: 60, MaxLevel: 60},
	}
	tracker := NewSpeedrunTracker(rules, units, engagement, nil)

	eid := uuid.New()

	engagement.FightStarted(eid, msg(t0))
	tracker.FightStarted(eid, msg(t0))

	// Only tank damages boss; AFK player does nothing.
	tank2 := tank
	_ = engagement.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &tank2,
		Target:      boss,
		Amount:      100,
	})

	c := &stubChar{id: boss, active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c)

	engagement.FightEnded(eid, msg(t0.Add(time.Minute)))
	tracker.FightEnded(eid, msg(t0.Add(time.Minute)))

	result := tracker.Result()
	require.NotNil(t, result.LevelRange)
	assert.True(t, result.LevelRange.Satisfied, "AFK low-level player should not cause violation")
	assert.True(t, result.Qualified)
	assert.Empty(t, result.LevelRange.Violators)
}

func TestSpeedrunTracker_LevelRange_MissingLevelDisqualifies(t *testing.T) {
	t.Parallel()
	units := newTestUnits()

	boss := makeCreatureGUID(100, 1)
	player := makePlayerGUID(1)

	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	// Level 0 = never received UNIT_INFO with level data.
	units.Info[player] = unitinfo.Info{Guid: player, Name: "MysteryPlayer", IsPlayer: true, CanCooperate: true, Level: 0}

	engagement := NewEngagementTracker(units)
	rules := SpeedrunRules{
		Requirements: []SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{100}, Count: 1},
		},
		LevelRange: &LevelRangeRequirement{MinLevel: 60, MaxLevel: 60},
	}
	tracker := NewSpeedrunTracker(rules, units, engagement, nil)

	eid := uuid.New()

	engagement.FightStarted(eid, msg(t0))
	tracker.FightStarted(eid, msg(t0))

	p := player
	_ = engagement.ProcessMessage(true, eid, &messages.Damage{
		MessageBase: messages.MessageBase{Timestamp: t0.Add(time.Second)},
		Caster:      &p,
		Target:      boss,
		Amount:      100,
	})

	c := &stubChar{id: boss, active: false, endState: period.EndStateSlain, hasPeriod: true}
	tracker.ActivityChange(msg(t0.Add(time.Minute)), c)

	engagement.FightEnded(eid, msg(t0.Add(time.Minute)))
	tracker.FightEnded(eid, msg(t0.Add(time.Minute)))

	result := tracker.Result()
	require.NotNil(t, result.LevelRange)
	assert.False(t, result.LevelRange.Satisfied, "missing level should disqualify")
	assert.False(t, result.Qualified)
	require.Len(t, result.LevelRange.Violators, 1)
	assert.Equal(t, "MysteryPlayer", result.LevelRange.Violators[0].PlayerName)
	assert.Equal(t, int32(0), result.LevelRange.Violators[0].Level)
}
