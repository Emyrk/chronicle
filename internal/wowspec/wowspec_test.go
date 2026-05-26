package wowspec_test

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/stretchr/testify/require"
)

func TestInferSpec(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		class    string
		talents  [3]uint8
		expected string
	}{
		// Basic cases — each class, clear winner in each tree.
		{name: "warrior/arms", class: "WARRIOR", talents: [3]uint8{31, 20, 0}, expected: "Arms"},
		{name: "warrior/fury", class: "WARRIOR", talents: [3]uint8{17, 34, 0}, expected: "Fury"},
		{name: "warrior/protection", class: "WARRIOR", talents: [3]uint8{0, 5, 46}, expected: "Protection"},

		{name: "paladin/holy", class: "PALADIN", talents: [3]uint8{35, 11, 5}, expected: "Holy"},
		{name: "paladin/protection", class: "PALADIN", talents: [3]uint8{0, 41, 10}, expected: "Protection"},
		{name: "paladin/retribution", class: "PALADIN", talents: [3]uint8{11, 0, 40}, expected: "Retribution"},

		{name: "hunter/bm", class: "HUNTER", talents: [3]uint8{41, 10, 0}, expected: "Beast Mastery"},
		{name: "hunter/mm", class: "HUNTER", talents: [3]uint8{0, 31, 20}, expected: "Marksmanship"},
		{name: "hunter/survival", class: "HUNTER", talents: [3]uint8{0, 10, 41}, expected: "Survival"},

		{name: "rogue/assassination", class: "ROGUE", talents: [3]uint8{31, 20, 0}, expected: "Assassination"},
		{name: "rogue/combat", class: "ROGUE", talents: [3]uint8{15, 31, 5}, expected: "Combat"},
		{name: "rogue/subtlety", class: "ROGUE", talents: [3]uint8{0, 0, 51}, expected: "Subtlety"},

		{name: "priest/discipline", class: "PRIEST", talents: [3]uint8{40, 5, 6}, expected: "Discipline"},
		{name: "priest/holy", class: "PRIEST", talents: [3]uint8{10, 41, 0}, expected: "Holy"},
		{name: "priest/shadow", class: "PRIEST", talents: [3]uint8{5, 0, 46}, expected: "Shadow"},

		{name: "shaman/elemental", class: "SHAMAN", talents: [3]uint8{41, 0, 10}, expected: "Elemental"},
		{name: "shaman/enhancement", class: "SHAMAN", talents: [3]uint8{0, 41, 10}, expected: "Enhancement"},
		{name: "shaman/restoration", class: "SHAMAN", talents: [3]uint8{5, 0, 46}, expected: "Restoration"},

		{name: "mage/arcane", class: "MAGE", talents: [3]uint8{40, 0, 11}, expected: "Arcane"},
		{name: "mage/fire", class: "MAGE", talents: [3]uint8{10, 41, 0}, expected: "Fire"},
		{name: "mage/frost", class: "MAGE", talents: [3]uint8{0, 0, 51}, expected: "Frost"},

		{name: "warlock/affliction", class: "WARLOCK", talents: [3]uint8{35, 0, 16}, expected: "Affliction"},
		{name: "warlock/demonology", class: "WARLOCK", talents: [3]uint8{7, 44, 0}, expected: "Demonology"},
		{name: "warlock/destruction", class: "WARLOCK", talents: [3]uint8{0, 10, 41}, expected: "Destruction"},

		{name: "druid/balance", class: "DRUID", talents: [3]uint8{41, 0, 10}, expected: "Balance"},
		{name: "druid/feral", class: "DRUID", talents: [3]uint8{0, 41, 10}, expected: "Feral"},
		{name: "druid/restoration", class: "DRUID", talents: [3]uint8{0, 10, 41}, expected: "Restoration"},

		{name: "dk/blood", class: "DEATH_KNIGHT", talents: [3]uint8{51, 0, 0}, expected: "Blood"},
		{name: "dk/frost", class: "DEATH_KNIGHT", talents: [3]uint8{0, 51, 0}, expected: "Frost"},
		{name: "dk/unholy", class: "DEATH_KNIGHT", talents: [3]uint8{0, 0, 51}, expected: "Unholy"},

		// Edge cases.
		{name: "zero_talents", class: "WARRIOR", talents: [3]uint8{0, 0, 0}, expected: "Unknown"},
		{name: "unknown_class", class: "BARD", talents: [3]uint8{10, 20, 30}, expected: "Unknown"},
		{name: "empty_class", class: "", talents: [3]uint8{10, 20, 30}, expected: "Unknown"},

		// Tie-breaking: lowest index wins.
		{name: "tie_0_1", class: "WARRIOR", talents: [3]uint8{20, 20, 10}, expected: "Arms"},
		{name: "tie_all", class: "MAGE", talents: [3]uint8{17, 17, 17}, expected: "Arcane"},
		{name: "tie_1_2", class: "ROGUE", talents: [3]uint8{0, 25, 25}, expected: "Combat"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := wowspec.InferSpec(tt.class, tt.talents)
			require.Equal(t, tt.expected, got)
		})
	}
}

func TestInferRoles(t *testing.T) {
	t.Parallel()

	t.Run("typical_raid", func(t *testing.T) {
		t.Parallel()
		players := map[string]wowspec.PlayerMetrics{
			// Tank: high damage taken
			"tank1": {DamageDone: 50000, DamageTaken: 200000, HealingDone: 0},
			// Healers: high healing, low DPS
			"healer1": {DamageDone: 5000, DamageTaken: 10000, HealingDone: 150000},
			"healer2": {DamageDone: 3000, DamageTaken: 8000, HealingDone: 120000},
			// DPS: high damage, low healing, low damage taken
			"dps1": {DamageDone: 180000, DamageTaken: 15000, HealingDone: 0},
			"dps2": {DamageDone: 160000, DamageTaken: 12000, HealingDone: 0},
			"dps3": {DamageDone: 150000, DamageTaken: 14000, HealingDone: 0},
			"dps4": {DamageDone: 140000, DamageTaken: 11000, HealingDone: 500},
			"dps5": {DamageDone: 130000, DamageTaken: 13000, HealingDone: 0},
		}
		roles := wowspec.InferRoles(players)
		require.Equal(t, "tank", roles["tank1"])
		require.Equal(t, "heal", roles["healer1"])
		require.Equal(t, "heal", roles["healer2"])
		require.Equal(t, "dps", roles["dps1"])
		require.Equal(t, "dps", roles["dps2"])
		require.Equal(t, "dps", roles["dps3"])
		require.Equal(t, "dps", roles["dps4"])
		require.Equal(t, "dps", roles["dps5"])
	})

	t.Run("single_player", func(t *testing.T) {
		t.Parallel()
		players := map[string]wowspec.PlayerMetrics{
			"solo": {DamageDone: 100000, DamageTaken: 50000, HealingDone: 0},
		}
		roles := wowspec.InferRoles(players)
		require.Equal(t, "dps", roles["solo"])
	})

	t.Run("empty", func(t *testing.T) {
		t.Parallel()
		roles := wowspec.InferRoles(map[string]wowspec.PlayerMetrics{})
		require.Empty(t, roles)
	})

	t.Run("all_same_stats", func(t *testing.T) {
		t.Parallel()
		players := map[string]wowspec.PlayerMetrics{
			"p1": {DamageDone: 100, DamageTaken: 100, HealingDone: 100},
			"p2": {DamageDone: 100, DamageTaken: 100, HealingDone: 100},
			"p3": {DamageDone: 100, DamageTaken: 100, HealingDone: 100},
		}
		roles := wowspec.InferRoles(players)
		// All identical — stddev = 0, no outliers — all DPS
		for _, r := range roles {
			require.Equal(t, "dps", r)
		}
	})
}

func TestTreeNames(t *testing.T) {
	t.Parallel()

	trees := wowspec.TreeNames("WARRIOR")
	require.Equal(t, [3]string{"Arms", "Fury", "Protection"}, trees)

	trees = wowspec.TreeNames("UNKNOWN")
	require.Equal(t, [3]string{"", "", ""}, trees)
}
