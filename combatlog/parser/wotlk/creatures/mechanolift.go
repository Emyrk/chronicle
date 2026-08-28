package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const mechanoliftEntry uint32 = 33214

func NewMechanolift(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != mechanoliftEntry {
		return nil, false
	}

	// NeverActive does not process unit metadata itself, so preserve the known
	// display name for instance unit lists and the Unit Lookup panel.
	all.DB().UpdateUnitName(id, "Mechanolift 304-A")

	// Mechanolifts are targetable encounter helpers, but their activity should
	// never start or extend an encounter.
	return characters.NewNeverActive(id), true
}
