package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/creatures"
)

func WoTLKCharacterFactories() []characters.CharacterFactory {
	return []characters.CharacterFactory{
		// Global
		creatures.NewTotemCharacter,
		creatures.NewCritterCharacter,
		creatures.NewObject,

		func(id guid.GUID, chars *characters.Characters) (characters.Character, bool) {
			return NewLogBasedCharacter(id, chars), true
		},
	}
}
