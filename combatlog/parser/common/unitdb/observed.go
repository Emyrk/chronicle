package unitdb

import (
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

// ignoredForeverObservedCreatures are utility summons, not instance inhabitants.
// This only filters catalogue membership, never their summon or other events.
var ignoredForeverObservedCreatures = map[uint32]string{
	214589: "Cozy Sleeping Bag",
}

// ObservedGUIDs applies server-flavor catalogue exclusions after the shared
// observation rules. Original events and unit metadata remain untouched.
func (us *Units) ObservedGUIDs(m messages.Message) []guid.GUID {
	ids := messages.ObservedGUIDs(m)
	if !us.flavor.Has(database.FlavorWoWForever) {
		return ids
	}
	return slices.DeleteFunc(ids, func(id guid.GUID) bool {
		if !id.IsCreature() {
			return false
		}
		entry, ok := id.GetEntry()
		if !ok {
			return false
		}
		_, ignored := ignoredForeverObservedCreatures[entry]
		return ignored
	})
}
