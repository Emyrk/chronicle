package unitname

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/common/traps"
	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// ByEntry is a static list of some unit names by their entry ID. Helps when
// identifying units in the combat log if their name is not given from the addon.
func ByEntry(entry uint32) string {
	return ""
}

// Canonicalize returns a stable display name for units whose runtime names can
// vary. Totem entry IDs already encode the rank, so their registry name omits
// redundant suffixes such as " III" or " IV".
func Canonicalize(id guid.GUID, name string) string {
	if totem, ok := totems.IsTotem(id); ok {
		return totem.Name
	}
	if name == "Unknown" && !id.IsPlayer() {
		if known := ByGUID(id); known != "" {
			return known
		}
	}
	return name
}

func ByGUID(id guid.GUID) string {
	if name, ok := warlockdemon.IsWarlockDemon(id); ok {
		return name
	}

	if totem, ok := totems.IsTotem(id); ok {
		return totem.Name
	}

	if trap, ok := traps.IsTrap(id); ok {
		return trap.Name
	}

	entry, ok := id.GetEntry()
	if !ok {
		return ""
	}

	return ByEntry(entry)
}
