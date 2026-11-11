package critters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	knowncritters "github.com/Emyrk/chronicle/combatlog/parsernext/common/critters"
)

func IsCritter(id guid.GUID) bool {
	if !id.IsCreature() {
		return false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return false
	}

	_, exists := knowncritters.Name(entry)
	return exists
}
