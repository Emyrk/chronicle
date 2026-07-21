package rankings

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
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

// results is a test helper to get the units map for an encounter.
func results(t *DPSTracker, encID uuid.UUID) map[guid.GUID]*UnitCombatStats {
	r := t.Result()
	if res, ok := r[encID]; ok {
		return res.Units
	}
	return nil
}
