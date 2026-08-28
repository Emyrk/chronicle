package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const mechanoliftEntry uint32 = 33214

func NewMechanolift(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != mechanoliftEntry || !id.IsVehicle() {
		return nil, false
	}

	// Mechanolifts are targetable encounter helpers, but their activity should
	// never start or extend an encounter.
	return characters.NewNamedNeverActive(id, all, "Mechanolift 304-A"), true
}
