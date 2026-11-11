package vanilla

import (
	"sort"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
)

// canonicalTalentTabs normalizes addon-provided tab order to the dataset's
// canonical order. Some localized clients emit the three tabs in a different
// order, so treating their positions as Balance/Feral/Restoration (and similar)
// corrupts both specialization inference and the displayed talent build.
func canonicalTalentTabs(input [3]messages.CombatantTalentTab, treeData *talents.TalentTreeData) [3]messages.CombatantTalentTab {
	if treeData == nil {
		return input
	}

	// Exact tab names are authoritative when the client and dataset use the same locale.
	for _, classData := range treeData.Classes {
		ordered := orderedTalentTabs(classData.Tabs)
		if len(ordered) != len(input) {
			continue
		}
		var result [3]messages.CombatantTalentTab
		used := [3]bool{}
		matched := true
		for canonicalIndex, tab := range ordered {
			found := -1
			for inputIndex, candidate := range input {
				if !used[inputIndex] && strings.EqualFold(candidate.TabName, tab.Name) {
					found = inputIndex
					break
				}
			}
			if found < 0 {
				matched = false
				break
			}
			used[found] = true
			result[canonicalIndex] = input[found]
			result[canonicalIndex].TabName = tab.Name
		}
		if matched {
			return result
		}
	}

	// Localized names cannot be compared to the English dataset. The number of
	// rank digits still identifies the tabs for classes whose three tree sizes
	// have exactly one possible dataset match. Ambiguous matches are left alone.
	permutations := [][3]int{
		{0, 1, 2}, {0, 2, 1}, {1, 0, 2},
		{1, 2, 0}, {2, 0, 1}, {2, 1, 0},
	}
	var result [3]messages.CombatantTalentTab
	matches := 0
	for _, classData := range treeData.Classes {
		ordered := orderedTalentTabs(classData.Tabs)
		if len(ordered) != len(input) {
			continue
		}
		for _, permutation := range permutations {
			matched := true
			for canonicalIndex, inputIndex := range permutation {
				if len(input[inputIndex].RankDigits) != len(ordered[canonicalIndex].Talents) {
					matched = false
					break
				}
			}
			if !matched {
				continue
			}
			matches++
			for canonicalIndex, inputIndex := range permutation {
				result[canonicalIndex] = input[inputIndex]
				result[canonicalIndex].TabName = ordered[canonicalIndex].Name
			}
		}
	}
	if matches == 1 {
		return result
	}
	return input
}

func canonicalCombatantTalents(input *combatant.Talents, class types.HeroClasses, treeData *talents.TalentTreeData) *combatant.Talents {
	if input == nil || treeData == nil {
		return input
	}

	classID, ok := talentClassID(class)
	if !ok {
		return input
	}
	classData, ok := treeData.Classes[classID]
	if !ok {
		return input
	}
	ordered := orderedTalentTabs(classData.Tabs)
	if len(ordered) != len(input.Trees) {
		return input
	}

	permutations := [][3]int{
		{0, 1, 2}, {0, 2, 1}, {1, 0, 2},
		{1, 2, 0}, {2, 0, 1}, {2, 1, 0},
	}
	var match [3]int
	matches := 0
	for _, permutation := range permutations {
		matched := true
		for canonicalIndex, inputIndex := range permutation {
			if len(input.Trees[inputIndex]) != len(ordered[canonicalIndex].Talents) {
				matched = false
				break
			}
		}
		if matched {
			match = permutation
			matches++
		}
	}
	if matches != 1 {
		return input
	}

	result := &combatant.Talents{}
	for canonicalIndex, inputIndex := range match {
		result.Summary[canonicalIndex] = input.Summary[inputIndex]
		result.Trees[canonicalIndex] = input.Trees[inputIndex]
		result.TabNames[canonicalIndex] = ordered[canonicalIndex].Name
	}
	return result
}

func talentClassID(class types.HeroClasses) (int32, bool) {
	switch class {
	case types.HeroClassesWARRIOR:
		return 1, true
	case types.HeroClassesPALADIN:
		return 2, true
	case types.HeroClassesHUNTER:
		return 3, true
	case types.HeroClassesROGUE:
		return 4, true
	case types.HeroClassesPRIEST:
		return 5, true
	case types.HeroClassesDEATHKNIGHT:
		return 6, true
	case types.HeroClassesSHAMAN:
		return 7, true
	case types.HeroClassesMAGE:
		return 8, true
	case types.HeroClassesWARLOCK:
		return 9, true
	case types.HeroClassesDRUID:
		return 11, true
	default:
		return 0, false
	}
}

func orderedTalentTabs(input []talents.TalentTabData) []talents.TalentTabData {
	ordered := append([]talents.TalentTabData(nil), input...)
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].OrderIndex < ordered[j].OrderIndex
	})
	return ordered
}
