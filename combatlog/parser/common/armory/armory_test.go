package armory

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func TestArmoryWriteOrderIsDeterministic(t *testing.T) {
	t.Parallel()

	guilds := map[string]map[guid.GUID]struct{}{
		"Zulu":  nil,
		"Alpha": nil,
		"Bravo": nil,
	}
	assert.Equal(t, []string{"Alpha", "Bravo", "Zulu"}, sortedGuildNames(guilds))

	players := map[guid.GUID]combatant.Combatant{
		guid.GUID(30): {},
		guid.GUID(10): {},
		guid.GUID(20): {},
	}
	assert.Equal(t, []guid.GUID{10, 20, 30}, sortedPlayerGUIDs(players))
}

func TestRenameGuilds(t *testing.T) {
	t.Parallel()

	leviaPlayer := guid.GUID(10)
	remnantPlayer := guid.GUID(20)
	tracker := &Tracker{
		Guilds: map[string]map[guid.GUID]struct{}{
			"Levia":   {leviaPlayer: {}},
			"Remnant": {remnantPlayer: {}},
		},
		Players: map[guid.GUID]combatant.Combatant{
			leviaPlayer: {
				Guid:  leviaPlayer,
				Guild: &combatant.Guild{Name: "Levia"},
			},
			remnantPlayer: {
				Guid:  remnantPlayer,
				Guild: &combatant.Guild{Name: "Remnant"},
			},
		},
	}

	tracker.RenameGuilds(func(name string) string {
		if name == "Levia" {
			return "Remnant"
		}
		return name
	})

	require.Len(t, tracker.Guilds, 1)
	assert.Contains(t, tracker.Guilds["Remnant"], leviaPlayer)
	assert.Contains(t, tracker.Guilds["Remnant"], remnantPlayer)
	assert.Equal(t, "Remnant", tracker.Players[leviaPlayer].Guild.Name)
	assert.Equal(t, "Remnant", tracker.Players[remnantPlayer].Guild.Name)
}

func TestOptionalGemEnchantIDs(t *testing.T) {
	t.Parallel()

	assert.Nil(t, optionalGemEnchantIDs([4]int{}))
	assert.Equal(t, []int32{3637, 3454, 0, 0}, optionalGemEnchantIDs([4]int{3637, 3454, 0, 0}))
}

func TestPersistedPlayerLevel(t *testing.T) {
	t.Parallel()

	playerID := guid.GUID(10)
	unitLevel := int32(79)
	combatantLevel := int32(80)

	units := unitdb.New()
	units.Update(unitinfo.Info{Guid: playerID, Level: unitLevel})

	assert.Equal(t, int16(80), persistedPlayerLevel(combatant.Combatant{
		Guid:  playerID,
		Level: &combatantLevel,
	}, units))
	assert.Equal(t, int16(79), persistedPlayerLevel(combatant.Combatant{
		Guid: playerID,
	}, units))
	assert.Equal(t, int16(0), persistedPlayerLevel(combatant.Combatant{
		Guid: guid.GUID(20),
	}, units))
}

func TestRespecInvalidatesRankingTalentsUntilFreshUpdate(t *testing.T) {
	t.Parallel()

	player, err := guid.FromString("0x0000000000000001")
	require.NoError(t, err)

	units := unitdb.New()
	tracker := New(units)
	initial := combatant.Combatant{
		Name: "Mage",
		Guid: player,
		Talents: &combatant.Talents{
			Summary: [3]uint8{10, 41, 0},
		},
	}
	units.UpdatePlayer(initial)
	tracker.Players[player] = initial

	respec := &messages.SpellGo{
		Caster:    player,
		SpellData: &chrondbc.Spell{ID: respecSpellID},
	}
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, respec))

	assert.Nil(t, tracker.Players[player].Talents)
	assert.Nil(t, units.Players[player].Talents)

	freshTalents := &messages.CombatantTalents{
		Guid:       player,
		PlayerName: "Mage",
		Tabs: [3]messages.CombatantTalentTab{
			{TabName: "Arcane", RankDigits: "510"},
			{TabName: "Fire", RankDigits: "000"},
			{TabName: "Frost", RankDigits: "000"},
		},
	}
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, freshTalents))

	require.NotNil(t, tracker.Players[player].Talents)
	require.NotNil(t, units.Players[player].Talents)
	assert.Equal(t, [3]uint8{6, 0, 0}, tracker.Players[player].Talents.Summary)
	assert.Equal(t, [3]uint8{6, 0, 0}, units.Players[player].Talents.Summary)

	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, respec))
	freshCombatant := &messages.Combatant{
		Combatant: combatant.Combatant{
			Name: "Mage",
			Guid: player,
			Talents: &combatant.Talents{
				Summary: [3]uint8{0, 0, 51},
			},
		},
	}
	require.NoError(t, units.ProcessMessage(freshCombatant))
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, freshCombatant))

	require.NotNil(t, tracker.Players[player].Talents)
	require.NotNil(t, units.Players[player].Talents)
	assert.Equal(t, [3]uint8{0, 0, 51}, tracker.Players[player].Talents.Summary)
	assert.Equal(t, [3]uint8{0, 0, 51}, units.Players[player].Talents.Summary)
}
