package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var ignisEntries = []uint32{33118, 33190}

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

	return characters.NewCommonCharacter(id, all).
		WithTimeoutAsDeathIf(func(all *characters.Characters) bool {
			for _, ignisEntry := range ignisEntries {
				for _, ignis := range all.ByEntry[ignisEntry] {
					if ignis.IsActive() {
						return true
					}
				}
			}
			return false
		}), true
}
