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

func TestInferRole(t *testing.T) {
	t.Parallel()

	tests := []struct {
		class, spec string
		expected    string
	}{
		{"WARRIOR", "Arms", "dps"},
		{"WARRIOR", "Fury", "dps"},
		{"WARRIOR", "Protection", "tank"},
		{"PALADIN", "Holy", "heal"},
		{"PALADIN", "Protection", "tank"},
		{"PALADIN", "Retribution", "dps"},
		{"PRIEST", "Discipline", "heal"},
		{"PRIEST", "Holy", "heal"},
		{"PRIEST", "Shadow", "dps"},
		{"SHAMAN", "Elemental", "dps"},
		{"SHAMAN", "Enhancement", "dps"},
		{"SHAMAN", "Restoration", "heal"},
		{"DRUID", "Balance", "dps"},
		{"DRUID", "Feral", "tank"},
		{"DRUID", "Restoration", "heal"},
		{"MAGE", "Fire", "dps"},
		{"ROGUE", "Combat", "dps"},
		{"WARLOCK", "Affliction", "dps"},
		{"HUNTER", "Marksmanship", "dps"},
		{"DEATH_KNIGHT", "Blood", "tank"},
		{"DEATH_KNIGHT", "Frost", "dps"},
		{"DEATH_KNIGHT", "Unholy", "dps"},
		{"UNKNOWN", "Unknown", "dps"},
	}

	for _, tt := range tests {
		t.Run(tt.class+"/"+tt.spec, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.expected, wowspec.InferRole(tt.class, tt.spec))
		})
	}
}

func TestTreeNames(t *testing.T) {
	t.Parallel()

	trees := wowspec.TreeNames("WARRIOR")
	require.Equal(t, [3]string{"Arms", "Fury", "Protection"}, trees)

	trees = wowspec.TreeNames("UNKNOWN")
	require.Equal(t, [3]string{"", "", ""}, trees)
}
