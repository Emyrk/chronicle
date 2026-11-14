package vanilla

import (
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/stretchr/testify/require"
)

func TestCanonicalTalentTabsReordersLocalizedDruidTrees(t *testing.T) {
	t.Parallel()

	input := [3]messages.CombatantTalentTab{
		{TabName: "야성", TalentCount: 18, RankDigits: "503030213232021521"},
		{TabName: "복원", TalentCount: 16, RankDigits: "0500000000000000"},
		{TabName: "조화", TalentCount: 20, RankDigits: "01400032010000000000"},
	}
	treeData := &talents.TalentTreeData{Classes: map[int32]talents.ClassTalentData{
		11: {Tabs: []talents.TalentTabData{
			{Name: "Restoration", OrderIndex: 2, Talents: make([]talents.TalentEntry, 16)},
			{Name: "Balance", OrderIndex: 0, Talents: make([]talents.TalentEntry, 20)},
			{Name: "Feral Combat", OrderIndex: 1, Talents: make([]talents.TalentEntry, 18)},
		}},
	}}

	got := canonicalTalentTabs(input, treeData)
	require.Equal(t, [3]messages.CombatantTalentTab{
		{TabName: "Balance", TalentCount: 20, RankDigits: "01400032010000000000"},
		{TabName: "Feral Combat", TalentCount: 18, RankDigits: "503030213232021521"},
		{TabName: "Restoration", TalentCount: 16, RankDigits: "0500000000000000"},
	}, got)
}

func TestCanonicalCombatantTalentsReordersUnnamedDruidTrees(t *testing.T) {
	t.Parallel()

	input := &combatant.Talents{
		Summary: [3]uint8{35, 5, 11},
		Trees: [3][]uint8{
			make([]uint8, 18),
			make([]uint8, 16),
			make([]uint8, 20),
		},
	}
	treeData := &talents.TalentTreeData{Classes: map[int32]talents.ClassTalentData{
		11: {Tabs: []talents.TalentTabData{
			{Name: "Restoration", OrderIndex: 2, Talents: make([]talents.TalentEntry, 16)},
			{Name: "Balance", OrderIndex: 0, Talents: make([]talents.TalentEntry, 20)},
			{Name: "Feral Combat", OrderIndex: 1, Talents: make([]talents.TalentEntry, 18)},
		}},
	}}

	got := canonicalCombatantTalents(input, types.HeroClassesDRUID, treeData)
	require.Equal(t, [3]uint8{11, 35, 5}, got.Summary)
	require.Equal(t, [3]string{"Balance", "Feral Combat", "Restoration"}, got.TabNames)
	require.Len(t, got.Trees[0], 20)
	require.Len(t, got.Trees[1], 18)
	require.Len(t, got.Trees[2], 16)
}

func TestCanonicalTalentTabsLeavesAmbiguousSizesUnchanged(t *testing.T) {
	t.Parallel()

	input := [3]messages.CombatantTalentTab{
		{TabName: "로컬1", TalentCount: 17, RankDigits: strings.Repeat("0", 17)},
		{TabName: "로컬2", TalentCount: 16, RankDigits: strings.Repeat("0", 16)},
		{TabName: "로컬3", TalentCount: 16, RankDigits: strings.Repeat("0", 16)},
	}
	treeData := &talents.TalentTreeData{Classes: map[int32]talents.ClassTalentData{
		2: {Tabs: []talents.TalentTabData{
			{Name: "Holy", OrderIndex: 0, Talents: make([]talents.TalentEntry, 17)},
			{Name: "Protection", OrderIndex: 1, Talents: make([]talents.TalentEntry, 16)},
			{Name: "Retribution", OrderIndex: 2, Talents: make([]talents.TalentEntry, 16)},
		}},
	}}

	require.Equal(t, input, canonicalTalentTabs(input, treeData))
}
