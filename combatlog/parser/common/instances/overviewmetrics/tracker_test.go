package overviewmetrics

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func TestTrackerAggregatesIncomingDamageToPlayersAndPets(t *testing.T) {
	t.Parallel()

	units := unitdb.New()
	player := guid.GUID(1)
	pet := guid.GUID(0xF140000001000001)
	hostile := guid.GUID(0xF130000002000001)
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Player", IsPlayer: true, CanCooperate: true}
	units.Info[pet] = unitinfo.Info{Guid: pet, Name: "Pet", Owner: &player, CanCooperate: true}
	units.Info[hostile] = unitinfo.Info{Guid: hostile, Name: "Hostile", CanCooperate: false}

	tracker := NewTracker(units)
	spellName := "Shadow Bolt"
	spell := &chrondbc.Spell{ID: 12345}
	caster := hostile
	encounterID := uuid.New()

	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Damage{
		Caster: &caster, Target: player, Amount: 600, SpellName: &spellName, SpellData: spell,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Damage{
		Caster: &caster, Target: pet, Amount: 400, SpellName: &spellName, SpellData: spell,
	}))
	require.NoError(t, tracker.ProcessMessage(false, encounterID, &messages.Damage{
		Caster: &caster, Target: player, Amount: 999, SpellName: &spellName, SpellData: spell,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Damage{
		Caster: &caster, Target: hostile, Amount: 999, SpellName: &spellName, SpellData: spell,
	}))

	abilities := tracker.Result()
	require.Len(t, abilities, 1)
	require.Equal(t, int64(1000), abilities[0].Damage)
	require.Equal(t, int64(2), abilities[0].Hits)
	require.Equal(t, int32(12345), *abilities[0].SpellID)
	require.Equal(t, "Shadow Bolt", abilities[0].Name)
}

func TestTrackerIncludesAbsorbedIncomingDamage(t *testing.T) {
	t.Parallel()

	units := unitdb.New()
	player := guid.GUID(1)
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Player", IsPlayer: true, CanCooperate: true}
	tracker := NewTracker(units)
	spellName := "Shadow Bolt"
	spell := &chrondbc.Spell{ID: 12345}
	partialAbsorb := uint32(200)
	fullAbsorb := uint32(500)

	require.NoError(t, tracker.ProcessMessage(true, uuid.New(), &messages.Damage{
		Target:    player,
		Amount:    800,
		SpellName: &spellName,
		SpellData: spell,
		Trailer:   types.Trailer{{Amount: &partialAbsorb, HitType: types.HitTypePartialAbsorb}},
	}))
	require.NoError(t, tracker.ProcessMessage(true, uuid.New(), &messages.Damage{
		Target:    player,
		Amount:    0,
		SpellName: &spellName,
		SpellData: spell,
		Trailer:   types.Trailer{{Amount: &fullAbsorb, HitType: types.HitTypeFullAbsorb}},
	}))

	abilities := tracker.Result()
	require.Len(t, abilities, 1)
	require.Equal(t, int64(1500), abilities[0].Damage)
	require.Equal(t, int64(2), abilities[0].Hits)
}

func TestTrackerKeepsTopTenAbilities(t *testing.T) {
	t.Parallel()

	units := unitdb.New()
	player := guid.GUID(1)
	units.Info[player] = unitinfo.Info{Guid: player, Name: "Player", IsPlayer: true, CanCooperate: true}
	tracker := NewTracker(units)

	for i := int32(1); i <= 11; i++ {
		name := "Ability"
		spell := &chrondbc.Spell{ID: chrondbc.SpellID(i)}
		require.NoError(t, tracker.ProcessMessage(true, uuid.New(), &messages.Damage{
			Target: player, Amount: i, SpellName: &name, SpellData: spell,
		}))
	}

	abilities := tracker.Result()
	require.Len(t, abilities, DeadliestAbilityLimit)
	require.Equal(t, int64(11), abilities[0].Damage)
	require.Equal(t, int32(11), *abilities[0].SpellID)
	require.Equal(t, int64(2), abilities[len(abilities)-1].Damage)
}
