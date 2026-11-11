package vanilla

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common/critters"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common/units"
)

// ClassifyCritter handles only known creature critters. A false result means
// unhandled, not unknown or ignored: callers must continue normal classification
// for players, pets, raid-friendly units and all other entities. GUID/name
// observations remain with the caller; critters.Name supplies canonical labels.
// No event filtering, activity tracking or ranking code is wired here.
func ClassifyCritter(id guid.GUID) (units.Classification, bool) {
	if !id.IsCreature() {
		return units.Classification{}, false
	}
	entry, ok := id.GetEntry()
	if !ok {
		return units.Classification{}, false
	}
	if _, known := critters.Name(entry); !known {
		return units.Classification{}, false
	}
	return units.Classification{
		Kind:               units.KindCreature,
		Category:           units.CategoryCritter,
		Known:              true,
		TrackFight:         false,
		RankedDamageTarget: false,
	}, true
}
