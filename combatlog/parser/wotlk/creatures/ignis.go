package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var ironConstructEntries = map[uint32]struct{}{
	33121: {},
	33191: {},
}

func NewIgnisIronConstruct(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := ironConstructEntries[entry]; !ok {
		return nil, false
	}

	return characters.NewCommonCharacter(id, all).WithTimeoutAsDeath(), true
}
