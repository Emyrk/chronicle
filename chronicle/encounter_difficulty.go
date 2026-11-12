package chronicle

import (
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
)

type encounterDifficulties struct {
	All   []string
	Clear string
	Mixed bool
}

// summarizeEncounterDifficulties uses the resolved difficulty of every boss
// attempt, including wipes, for clear eligibility. Trash is retained in All for
// analysis but cannot invalidate an otherwise homogeneous boss clear.
func summarizeEncounterDifficulties(encounters []encounter.Encounter) encounterDifficulties {
	all := make(map[string]struct{})
	bosses := make(map[string]struct{})
	for _, enc := range encounters {
		all[enc.Combat.Difficulty] = struct{}{}
		if enc.Boss {
			bosses[enc.Combat.Difficulty] = struct{}{}
		}
	}
	out := encounterDifficulties{All: make([]string, 0, len(all)), Mixed: len(bosses) > 1}
	for difficulty := range all {
		out.All = append(out.All, difficulty)
	}
	slices.Sort(out.All)
	if len(bosses) == 1 {
		for difficulty := range bosses {
			out.Clear = difficulty
		}
	}
	return out
}
