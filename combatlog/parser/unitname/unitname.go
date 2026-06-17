package unitname

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
)

// ByEntry is a static list of some unit names by their entry ID. Helps when
// identifying units in the combat log if their name is not given from the addon.
func ByEntry(entry uint32) string {
	return ""
}

func ByGUID(id guid.GUID) string {
	if name, ok := warlockdemon.IsWarlockDemon(id); ok {
		return name
	}

	if totem, ok := totems.IsTotem(id); ok {
		return totem.Name
	}

	entry, ok := id.GetEntry()
	if !ok {
		return ""
	}

	return ByEntry(entry)
}
