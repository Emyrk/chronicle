package rankings

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

func setupDPSTracker() (*DPSTracker, *unitdb.Units) {
	units := newTestUnits()
	tracker := NewDPSTracker(units)
	return tracker, units
}

func TestDPSTracker_BasicDamage(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	tracker.FightStarted(encID, nil)

	caster := player
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 500,
		HitType: types.HitTypeHit,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 300,
		HitType: types.HitTypeHit,
	})

	tracker.FightEnded(encID, nil)

	results := tracker.Result()
	require.Contains(t, results, encID)
	require.Contains(t, results[encID].Units, player)
	assert.Equal(t, int64(800), results[encID].Units[player].DamageDone)
	assert.True(t, results[encID].Units[player].IsPlayer)
	assert.Nil(t, results[encID].Units[player].OwnerGUID)
}

func TestDPSTracker_IncludesAbsorbedDamage(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	partialAbsorb := uint32(200)
	fullAbsorb := uint32(500)
	caster := player

	tracker.FightStarted(encID, nil)
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster:  &caster,
		Target:  boss,
		Amount:  800,
		HitType: types.HitTypeHit,
		Trailer: types.Trailer{{Amount: &partialAbsorb, HitType: types.HitTypePartialAbsorb}},
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster:  &caster,
		Target:  boss,
		Amount:  0,
		HitType: types.HitTypeFullAbsorb,
		Trailer: types.Trailer{{Amount: &fullAbsorb, HitType: types.HitTypeFullAbsorb}},
	})
	tracker.FightEnded(encID, nil)

	result := tracker.Result()[encID].Units[player]
	require.NotNil(t, result)
	assert.Equal(t, int64(1500), result.DamageDone)
}

func TestDPSTracker_HostileOnly(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player1 := makePlayerGUID(1)
	player2 := makePlayerGUID(2)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player1] = unitinfo.Info{Guid: player1, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[player2] = unitinfo.Info{Guid: player2, Name: "Mage", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	tracker.FightStarted(encID, nil)

	caster1 := player1
	// Damage to hostile → counted.
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster1, Target: boss, Amount: 1000,
		HitType: types.HitTypeHit,
	})
	// Damage to friendly player → NOT counted for damage done.
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster1, Target: player2, Amount: 200,
		HitType: types.HitTypeHit,
	})

	tracker.FightEnded(encID, nil)

	results := tracker.Result()
	assert.Equal(t, int64(1000), results[encID].Units[player1].DamageDone)
	// player2 should have damage taken from the friendly fire.
	assert.Equal(t, int64(200), results[encID].Units[player2].DamageTaken)
}

func TestDPSTracker_PetDamage(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	pet := makePetGUID(200, 1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Hunter", IsPlayer: true, CanCooperate: true}
	units.Info[pet] = unitinfo.Info{Guid: pet, Name: "Wolf", Owner: &player, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	tracker.FightStarted(encID, nil)

	playerGUID := player
	petGUID := pet
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &playerGUID, Target: boss, Amount: 600,
		HitType: types.HitTypeHit,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &petGUID, Target: boss, Amount: 400,
		HitType: types.HitTypeHit,
	})

	tracker.FightEnded(encID, nil)

	results := tracker.Result()
	// Pet records its own damage.
	require.Contains(t, results[encID].Units, pet)
	assert.Equal(t, int64(400), results[encID].Units[pet].DamageDone)
	assert.False(t, results[encID].Units[pet].IsPlayer)
	assert.Equal(t, &player, results[encID].Units[pet].OwnerGUID)
	// Player records only their own direct damage.
	assert.Equal(t, int64(600), results[encID].Units[player].DamageDone)
}

func TestDPSTracker_ChainedSummonDamageUsesRootOwner(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	totem := makeCreatureGUID(200, 1)
	elemental := makeCreatureGUID(201, 1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Update(unitinfo.Info{Guid: player, Name: "Shaman", IsPlayer: true, CanCooperate: true})
	units.Update(unitinfo.Info{Guid: totem, Name: "Fire Elemental Totem", CanCooperate: true})
	units.Update(unitinfo.Info{Guid: elemental, Name: "Greater Fire Elemental", CanCooperate: true})
	units.Update(unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false})

	// Match the combat-log order: the totem summons the elemental before the
	// player-to-totem ownership event is observed.
	units.UpdateOwner(elemental, totem)
	units.UpdateOwner(totem, player)

	tracker.FightStarted(encID, nil)
	elementalGUID := elemental
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster:  &elementalGUID,
		Target:  boss,
		Amount:  400,
		HitType: types.HitTypeHit,
	}))
	tracker.FightEnded(encID, nil)

	stats := tracker.Result()[encID].Units[elemental]
	require.NotNil(t, stats)
	assert.Equal(t, int64(400), stats.DamageDone)
	require.NotNil(t, stats.OwnerGUID)
	assert.Equal(t, player, *stats.OwnerGUID)
}

func TestDPSTracker_EffectiveHealing(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	healer := makePlayerGUID(1)
	target := makePlayerGUID(2)
	encID := uuid.New()

	units.Info[healer] = unitinfo.Info{Guid: healer, Name: "Priest", IsPlayer: true, CanCooperate: true}
	units.Info[target] = unitinfo.Info{Guid: target, Name: "Tank", IsPlayer: true, CanCooperate: true}

	tracker.FightStarted(encID, nil)

	// 500 heal, 100 overheal → 400 effective.
	_ = tracker.ProcessMessage(true, encID, &messages.Heal{
		Caster: healer, Target: target, Amount: 500, Overheal: 100,
	})
	// 300 heal, 300 overheal → 0 effective (all wasted).
	_ = tracker.ProcessMessage(true, encID, &messages.Heal{
		Caster: healer, Target: target, Amount: 300, Overheal: 300,
	})

	tracker.FightEnded(encID, nil)

	results := tracker.Result()
	assert.Equal(t, int64(400), results[encID].Units[healer].HealingDone)
}

func TestDPSTracker_HealingTargetsMatchHealingDonePanel(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	healer := makePlayerGUID(1)
	playerTarget := makePlayerGUID(2)
	petTarget := makePetGUID(300, 1)
	friendlyNPC := makeCreatureGUID(200, 1)
	encID := uuid.New()

	units.Info[healer] = unitinfo.Info{Guid: healer, Name: "Priest", IsPlayer: true, CanCooperate: true}
	units.Info[playerTarget] = unitinfo.Info{Guid: playerTarget, Name: "Tank", IsPlayer: true, CanCooperate: true}
	units.Info[petTarget] = unitinfo.Info{Guid: petTarget, Name: "Pet", CanCooperate: true, Owner: &playerTarget}
	units.Info[friendlyNPC] = unitinfo.Info{Guid: friendlyNPC, Name: "Friendly NPC", CanCooperate: true}

	tracker.FightStarted(encID, nil)

	_ = tracker.ProcessMessage(true, encID, &messages.Heal{
		Caster: healer, Target: playerTarget, Amount: 100,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Heal{
		Caster: healer, Target: petTarget, Amount: 200,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Heal{
		Caster: healer, Target: friendlyNPC, Amount: 400,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Absorbed{
		Target: playerTarget, Caster: healer, Amount: 50,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Absorbed{
		Target: petTarget, Caster: healer, Amount: 75,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Absorbed{
		Target: friendlyNPC, Caster: healer, Amount: 125,
	})

	tracker.FightEnded(encID, nil)

	stats := tracker.Result()[encID].Units[healer]
	require.NotNil(t, stats)
	assert.Equal(t, int64(300), stats.HealingDone)
	assert.Equal(t, int64(125), stats.HealingAbsorbed)
}

func TestDPSTracker_AbsorbAttribution(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	priest := makePlayerGUID(1)
	tank := makePlayerGUID(2)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[priest] = unitinfo.Info{Guid: priest, Name: "Priest", IsPlayer: true, CanCooperate: true}
	units.Info[tank] = unitinfo.Info{Guid: tank, Name: "Tank", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	tracker.FightStarted(encID, nil)

	// Absorbs are credited to the shield caster.
	_ = tracker.ProcessMessage(true, encID, &messages.Absorbed{
		Attacker: boss, Target: tank, Caster: priest, Amount: 600,
	})
	_ = tracker.ProcessMessage(true, encID, &messages.Absorbed{
		Attacker: boss, Target: tank, Caster: priest, Amount: 150,
	})
	// Unknown caster → not credited.
	_ = tracker.ProcessMessage(true, encID, &messages.Absorbed{
		Attacker: boss, Target: tank, Caster: guid.GUID(0), Amount: 999,
	})

	tracker.FightEnded(encID, nil)

	results := tracker.Result()
	require.Contains(t, results[encID].Units, priest)
	assert.Equal(t, int64(750), results[encID].Units[priest].HealingAbsorbed)
	assert.Equal(t, int64(0), results[encID].Units[priest].HealingDone)
	// The damage target gets no absorb credit.
	if tankStats, ok := results[encID].Units[tank]; ok {
		assert.Equal(t, int64(0), tankStats.HealingAbsorbed)
	}

	// Absorb state resets between fights.
	encID2 := uuid.New()
	tracker.FightStarted(encID2, nil)
	tracker.FightEnded(encID2, nil)
	results = tracker.Result()
	if priestStats, ok := results[encID2].Units[priest]; ok {
		assert.Equal(t, int64(0), priestStats.HealingAbsorbed)
	}
}

func TestDPSTracker_DamageTakenPlayersOnly(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Tank", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	tracker.FightStarted(encID, nil)

	bossGUID := boss
	playerGUID := player
	// Boss hits player → player damage taken tracked.
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &bossGUID, Target: player, Amount: 1000,
		HitType: types.HitTypeHit,
	})
	// Player hits boss → boss damage taken NOT tracked (not a player).
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &playerGUID, Target: boss, Amount: 500,
		HitType: types.HitTypeHit,
	})

	tracker.FightEnded(encID, nil)

	r := results(tracker, encID)
	require.Contains(t, r, player)
	assert.Equal(t, int64(1000), r[player].DamageTaken)
	// Boss should not appear in results — only players get damage taken tracked.
	assert.NotContains(t, r, boss)
}

func TestDPSTracker_FightStartedResets(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	enc1 := uuid.New()
	enc2 := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	// Encounter 1.
	tracker.FightStarted(enc1, nil)
	caster := player
	_ = tracker.ProcessMessage(true, enc1, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 1000,
		HitType: types.HitTypeHit,
	})
	tracker.FightEnded(enc1, nil)

	// Encounter 2 — should start fresh.
	tracker.FightStarted(enc2, nil)
	_ = tracker.ProcessMessage(true, enc2, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 200,
		HitType: types.HitTypeHit,
	})
	tracker.FightEnded(enc2, nil)

	r := tracker.Result()
	assert.Equal(t, int64(1000), r[enc1].Units[player].DamageDone)
	assert.Equal(t, int64(200), r[enc2].Units[player].DamageDone)
}

func TestDPSTracker_TalentSnapshot(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Mage", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Players[player] = combatant.Combatant{
		Name: "Mage",
		Guid: player,
		Talents: &combatant.Talents{
			Summary: [3]uint8{10, 41, 0},
		},
	}

	tracker.FightStarted(encID, nil)
	caster := player
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 100,
		HitType: types.HitTypeHit,
	})
	tracker.FightEnded(encID, nil)

	r := tracker.Result()
	require.NotNil(t, r[encID].Units[player].Talents)
	assert.Equal(t, [3]uint8{10, 41, 0}, r[encID].Units[player].Talents.Summary)
}

func TestDPSTracker_TalentSnapshotNilWhenInvalidated(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Mage", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	// Player has no talents (e.g., invalidated by respec).
	units.Players[player] = combatant.Combatant{
		Name:    "Mage",
		Guid:    player,
		Talents: nil,
	}

	tracker.FightStarted(encID, nil)
	caster := player
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 100,
		HitType: types.HitTypeHit,
	})
	tracker.FightEnded(encID, nil)

	r := tracker.Result()
	assert.Nil(t, r[encID].Units[player].Talents)
}

func TestDPSTracker_InactiveMessagesIgnored(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	tracker.FightStarted(encID, nil)

	caster := player
	// Inactive message → should be ignored.
	_ = tracker.ProcessMessage(false, encID, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 999,
		HitType: types.HitTypeHit,
	})

	tracker.FightEnded(encID, nil)

	r := tracker.Result()
	// No damage recorded since message was inactive.
	assert.Empty(t, r[encID].Units)
}

func TestDPSTracker_IncomingAutoAttacks(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	tank := makePlayerGUID(1)
	dps := makePlayerGUID(2)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[tank] = unitinfo.Info{Guid: tank, Name: "Tank", IsPlayer: true, CanCooperate: true}
	units.Info[dps] = unitinfo.Info{Guid: dps, Name: "DPS", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}

	autoSpell := &chrondbc.Spell{ID: chrondbc.SpellIDAutoAttack}

	tracker.FightStarted(encID, nil)

	bossGUID := boss
	// Boss auto-attacks tank 5 times (including one zero-damage dodge).
	for i := 0; i < 4; i++ {
		_ = tracker.ProcessMessage(true, encID, &messages.Damage{
			Caster:    &bossGUID,
			Target:    tank,
			Amount:    500,
			SpellData: autoSpell,
			SpellName: ptr.Ref("Auto Attack"),
			HitType:   types.HitTypeHit,
		})
	}
	// Zero-damage dodge — should still count.
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster:    &bossGUID,
		Target:    tank,
		Amount:    0,
		SpellData: autoSpell,
		SpellName: ptr.Ref("Auto Attack"),
		HitType:   types.HitTypeDodge,
	})
	// Boss auto-attacks dps once.
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster:    &bossGUID,
		Target:    dps,
		Amount:    500,
		SpellData: autoSpell,
		SpellName: ptr.Ref("Auto Attack"),
		HitType:   types.HitTypeHit,
	})
	// Non-auto-attack spell damage to tank — should NOT be counted.
	spellID := chrondbc.SpellID(12345)
	_ = tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster:    &bossGUID,
		Target:    tank,
		Amount:    1000,
		SpellData: &chrondbc.Spell{ID: spellID},
		SpellName: ptr.Ref("Shadow Bolt"),
		HitType:   types.HitTypeHit,
	})

	tracker.FightEnded(encID, nil)

	r := results(tracker, encID)
	require.Contains(t, r, tank)
	require.Contains(t, r, dps)

	// Tank should have 5 auto-attack attempts from boss.
	assert.Equal(t, map[guid.GUID]int{boss: 5}, r[tank].IncomingAutoAttacks)
	// DPS should have 1 auto-attack attempt from boss.
	assert.Equal(t, map[guid.GUID]int{boss: 1}, r[dps].IncomingAutoAttacks)
}

func TestDPSTracker_IncomingAutoAttacks_AoENotTank(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	p1 := makePlayerGUID(1)
	p2 := makePlayerGUID(2)
	p3 := makePlayerGUID(3)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[p1] = unitinfo.Info{Guid: p1, Name: "P1", IsPlayer: true, CanCooperate: true}
	units.Info[p2] = unitinfo.Info{Guid: p2, Name: "P2", IsPlayer: true, CanCooperate: true}
	units.Info[p3] = unitinfo.Info{Guid: p3, Name: "P3", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "CleaveBot", CanCooperate: false}

	autoSpell := &chrondbc.Spell{ID: chrondbc.SpellIDAutoAttack}
	bossGUID := boss

	tracker.FightStarted(encID, nil)

	// Boss auto-attacks each player 3 times (AoE/cleave).
	for _, p := range []guid.GUID{p1, p2, p3} {
		for i := 0; i < 3; i++ {
			_ = tracker.ProcessMessage(true, encID, &messages.Damage{
				Caster:    &bossGUID,
				Target:    p,
				Amount:    200,
				SpellData: autoSpell,
				SpellName: ptr.Ref("Auto Attack"),
				HitType:   types.HitTypeHit,
			})
		}
	}

	tracker.FightEnded(encID, nil)

	r := results(tracker, encID)
	// All players should have exactly 3 auto-attack attempts from boss.
	for _, p := range []guid.GUID{p1, p2, p3} {
		require.Contains(t, r, p)
		assert.Equal(t, map[guid.GUID]int{boss: 3}, r[p].IncomingAutoAttacks)
	}
}

// results is a test helper to get the units map for an encounter.
func results(t *DPSTracker, encID uuid.UUID) map[guid.GUID]*UnitCombatStats {
	r := t.Result()
	if res, ok := r[encID]; ok {
		return res.Units
	}
	return nil
}
