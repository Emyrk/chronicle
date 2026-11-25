package instances

import (
	"fmt"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
)

// Count observed distinct tower buffs on the boss. Unlike Yogg, zero towers
// needs no earlier encounter: Leviathan is the first encounter in Ulduar.
func leviathanEncounterVariant(enc *encounter.Encounter) string {
	if enc.VariantAuras == nil || enc.Combat.Start.IsZero() || !enc.Combat.End.After(enc.Combat.Start) {
		return ""
	}
	towers := 0
	for _, aliases := range [][]int32{{65075}, {65076}, {64482}, {65077, 65079}} {
		for _, spell := range aliases {
			if slices.Contains(enc.VariantAuras, spell) {
				towers++
				break
			}
		}
	}
	return fmt.Sprintf("towers_%d", towers)
}
