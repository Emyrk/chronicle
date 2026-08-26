package creatures

import (
	"github.com/Emyrk/chronicle/database"
)

// RazorgoreEggThreshold returns the flavor-specific egg count that marks
// the transition from Phase 1 (adds) to Phase 2 (boss). A return value
// of 0 means the flavor is unsupported and no phases should be emitted.
func RazorgoreEggThreshold(flavor database.WoWFlavor) int {
	switch {
	case flavor.Has(database.FlavorNightmareOfUrsol):
		return 20
	case flavor.Has(database.FlavorVanillaPlus):
		return 30
	default:
		return 0
	}
}
