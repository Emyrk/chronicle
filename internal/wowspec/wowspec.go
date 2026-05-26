// Package wowspec provides World of Warcraft talent specialization inference.
package wowspec

// specMap maps class name → [3]talent tree spec names (tree0, tree1, tree2).
var specMap = map[string][3]string{
	"WARRIOR":      {"Arms", "Fury", "Protection"},
	"PALADIN":      {"Holy", "Protection", "Retribution"},
	"HUNTER":       {"Beast Mastery", "Marksmanship", "Survival"},
	"ROGUE":        {"Assassination", "Combat", "Subtlety"},
	"PRIEST":       {"Discipline", "Holy", "Shadow"},
	"SHAMAN":       {"Elemental", "Enhancement", "Restoration"},
	"MAGE":         {"Arcane", "Fire", "Frost"},
	"WARLOCK":      {"Affliction", "Demonology", "Destruction"},
	"DRUID":        {"Balance", "Feral", "Restoration"},
	"DEATH_KNIGHT": {"Blood", "Frost", "Unholy"},
}

// InferSpec returns the broad specialization name for the given class and
// talent point distribution. The talentSummary must contain the total points
// spent in each of the class's three talent trees (index 0, 1, 2).
//
// Returns "Unknown" when the class is unrecognized or all talent points are zero.
// Ties are broken by lowest index (conventional tree ordering).
func InferSpec(class string, talentSummary [3]uint8) string {
	trees, ok := specMap[class]
	if !ok {
		return "Unknown"
	}

	// All zeros means no talent data available.
	if talentSummary[0] == 0 && talentSummary[1] == 0 && talentSummary[2] == 0 {
		return "Unknown"
	}

	// Find tree with the most points. Ties go to the lowest index.
	best := 0
	for i := 1; i < 3; i++ {
		if talentSummary[i] > talentSummary[best] {
			best = i
		}
	}

	return trees[best]
}

// Classes returns all recognized class names.
func Classes() []string {
	out := make([]string, 0, len(specMap))
	for k := range specMap {
		out = append(out, k)
	}
	return out
}

// TreeNames returns the three talent tree names for the given class,
// or an empty array if the class is unrecognized.
func TreeNames(class string) [3]string {
	return specMap[class]
}
