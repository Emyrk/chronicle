package rankings

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
)

func setupDPSTracker() (*DPSTracker, *unitdb.Units) {
	units := newTestUnits()
	tracker := NewDPSTracker(units, nil, DamageRuleNone)
	return tracker, units
}

func TestDPSTracker_BasicDamage(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
	assert.Equal(t, int64(800), results[encID].Units[player].RankedDamageDone)
	assert.True(t, results[encID].Units[player].IsPlayer)
	assert.Nil(t, results[encID].Units[player].OwnerGUID)
}

func TestDPSTracker_SeparatesRankedBossDamage(t *testing.T) {
	t.Parallel()

	units := newTestUnits()
	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	add := makeCreatureGUID(101, 2)
	encID := uuid.New()
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false}
	units.Info[add] = unitinfo.Info{Guid: add, Name: "Add", CanCooperate: false}
	idf := identifier.NewIdentifier(map[uint32]identifier.Identity{
		100: {Name: "Boss", Boss: true},
		101: {Name: "Add"},
	})
	tracker := NewDPSTracker(units, idf, DamageRuleNone)

	tracker.FightStarted(encID, nil)
	caster := player
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: boss, Amount: 500,
	}))
	addDamage := &messages.Damage{Caster: &caster, Target: add, Amount: 200}
	require.NoError(t, tracker.ProcessMessage(true, encID, addDamage))
	tracker.FightEnded(encID, nil)

	stats := tracker.Result()[encID].Units[player]
	require.NotNil(t, stats)
	assert.Equal(t, int64(700), stats.DamageDone)
	assert.Equal(t, int64(700), stats.RankedDamageDone) // Default includes adds.
	tracker.ClassifyDamage(encID, DamageTargets{Mode: DamageTargetsBossOnly}, addDamage)
	tracker.FinishDamageClassification(encID)
	assert.Equal(t, int64(200), addDamage.Unranked)
	assert.Equal(t, int64(500), stats.RankedDamageDone)
	assert.Equal(t, int64(200), stats.UnrankedDamageDone)
}

func TestDPSTracker_WhitelistExcludesEffectiveDamageButNotOverkill(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()
	player := makePlayerGUID(1)
	boss := makeCreatureGUID(12057, 1)
	add := makeCreatureGUID(12099, 2)
	other := makeCreatureGUID(101, 3)
	for _, target := range []guid.GUID{boss, add, other} {
		units.Info[target] = unitinfo.Info{Guid: target, CanCooperate: false}
	}
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	encID := uuid.New()
	tracker.FightStarted(encID, nil)
	caster := player
	allowed := &messages.Damage{Caster: &caster, Target: add, Amount: 100}
	excluded := &messages.Damage{Caster: &caster, Target: other, Amount: 200, Overkill: 50}
	require.NoError(t, tracker.ProcessMessage(true, encID, allowed))
	require.NoError(t, tracker.ProcessMessage(true, encID, excluded))
	tracker.FightEnded(encID, nil)
	rule := DamageTargets{Mode: DamageTargetsEntries, EntryIDs: []uint32{12057, 12099}}
	tracker.ClassifyDamage(encID, rule, allowed)
	tracker.ClassifyDamage(encID, rule, excluded)
	tracker.FinishDamageClassification(encID)
	stats := tracker.Result()[encID].Units[player]
	require.Equal(t, int64(250), stats.DamageDone)
	require.Equal(t, int64(100), stats.RankedDamageDone)
	require.Equal(t, int64(150), stats.UnrankedDamageDone)
	require.Zero(t, allowed.Unranked)
	require.Equal(t, int64(150), excluded.Unranked)
}

func TestDPSTrackerAssemblyOfIronTargets(t *testing.T) {
	t.Parallel()

	tracker := newDPSTrackerAssemblyOfIron()
	for _, entry := range []uint32{32857, 32867, 32927, 33692, 33693, 33694} {
		require.True(t, tracker.isPhaseTarget(makeCreatureGUID(entry, 1)), "entry %d", entry)
	}
	require.False(t, tracker.isPhaseTarget(makeCreatureGUID(33113, 1)))
}

func TestDPSTracker_PhaseTargetsCommitOnlySlainTarget(t *testing.T) {
	t.Parallel()

	units := newTestUnits()
	tracker := NewDPSTracker(units, nil, DamageRuleAssemblyOfIron)
	player := makePlayerGUID(1)
	steelbreaker := makeCreatureGUID(32867, 1)
	molgeim := makeCreatureGUID(32927, 2)
	encID := uuid.New()
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[steelbreaker] = unitinfo.Info{Guid: steelbreaker, Name: "Steelbreaker", CanCooperate: false}
	units.Info[molgeim] = unitinfo.Info{Guid: molgeim, Name: "Runemaster Molgeim", CanCooperate: false}

	tracker.FightStarted(encID, nil)
	caster := player
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: steelbreaker, Amount: 500,
	}))
	molgeimDamage := &messages.Damage{Caster: &caster, Target: molgeim, Amount: 80}
	require.NoError(t, tracker.ProcessMessage(true, encID, molgeimDamage))
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Slain{Victim: steelbreaker}))
	tracker.FightEnded(encID, nil)
	tracker.ClassifyDamage(encID, DamageTargets{}, molgeimDamage)
	tracker.FinishDamageClassification(encID)

	stats := tracker.Result()[encID].Units[player]
	require.Equal(t, int64(580), stats.DamageDone)
	require.Equal(t, int64(500), stats.RankedDamageDone)
	require.Equal(t, int64(80), stats.UnrankedDamageDone)
	require.Equal(t, int64(80), molgeimDamage.Unranked)
}

func TestDPSTracker_PhaseTargetsCommitUnresolvedDamageAtFightEnd(t *testing.T) {
	t.Parallel()

	units := newTestUnits()
	tracker := NewDPSTracker(units, nil, DamageRuleAssemblyOfIron)
	player := makePlayerGUID(1)
	steelbreaker := makeCreatureGUID(32867, 1)
	molgeim := makeCreatureGUID(32927, 2)
	encID := uuid.New()
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[steelbreaker] = unitinfo.Info{Guid: steelbreaker, Name: "Steelbreaker", CanCooperate: false}
	units.Info[molgeim] = unitinfo.Info{Guid: molgeim, Name: "Runemaster Molgeim", CanCooperate: false}

	tracker.FightStarted(encID, nil)
	caster := player
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: steelbreaker, Amount: 500,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster: &caster, Target: molgeim, Amount: 80,
	}))
	tracker.FightEnded(encID, nil)

	stats := tracker.Result()[encID].Units[player]
	require.Equal(t, int64(580), stats.DamageDone)
	require.Equal(t, int64(580), stats.RankedDamageDone)
}

func TestDPSTracker_IncludesInjectedHostileVehicleDamage(t *testing.T) {
	t.Parallel()

	tracker, units := setupDPSTracker()
	player := makePlayerGUID(1)
	boss, err := guid.FromString("0xF15000820D000300")
	require.NoError(t, err)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.InjectAffiliation(boss, unitdb.AffiliationHostile)

	tracker.FightStarted(encID, nil)
	caster := player
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Damage{
		Caster:  &caster,
		Target:  boss,
		Amount:  6_000,
		HitType: types.HitTypeHit,
	}))
	tracker.FightEnded(encID, nil)

	require.Equal(t, int64(6_000), tracker.Result()[encID].Units[player].DamageDone)
}

func TestDPSTracker_IncludesAbsorbedDamage(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
	units.Update(unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true})

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
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}
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
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}
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

func TestDPSTrackerForwardsFormLifecycle(t *testing.T) {
	t.Parallel()

	tracker, units := setupDPSTracker()
	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()
	actualStart := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	hookStart := actualStart.Add(10 * time.Second)
	end := actualStart.Add(30 * time.Second)
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Druid", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, &messages.Aura{
		MessageBase: messages.Base(actualStart.Add(-time.Minute)),
		Target:      player,
		SpellName:   "Cat Form",
		Application: types.AuraApplicationGains,
	}))
	tracker.FightStarted(encID, &messages.Damage{MessageBase: messages.Base(hookStart)})
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Aura{
		MessageBase: messages.Base(actualStart.Add(20 * time.Second)),
		Target:      player,
		SpellName:   "Bear Form",
		Application: types.AuraApplicationGains,
	}))
	caster := player
	require.NoError(t, tracker.ProcessMessage(true, encID, &messages.Damage{
		MessageBase: messages.Base(end),
		Caster:      &caster,
		Target:      boss,
		Amount:      1,
	}))
	tracker.FightEnded(encID, &messages.Damage{MessageBase: messages.Base(end)})
	require.Empty(t, tracker.Result()[encID].Units[player].ObservedForm)

	tracker.FightFinalized(encID, actualStart, end)
	require.Equal(t, "Cat", tracker.Result()[encID].Units[player].ObservedForm)
}

func TestDPSTracker_InactiveMessagesIgnored(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()

	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encID := uuid.New()

	units.Info[player] = unitinfo.Info{Guid: player, Name: "Warrior", IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, Name: "Boss", CanCooperate: false, Boss: true}

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
