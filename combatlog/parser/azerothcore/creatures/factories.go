package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/creatures"
)

func AzerothServersideCoreCharacterFactories() []characters.CharacterFactory {
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

func NewAzerothCoreCharacterFactories() []characters.CharacterFactory {
	cres := creatures.TurtleCharacterFactories()

	cres = append([]characters.CharacterFactory{
		// The Nexus
		NewAzureEnforcer,
		NewCrazedManaWraith,
		NewMageHunterAscendant,
		NewCrystallineFrayer,

		// Hellfire Ramparts
		NewOmarTheUnscarred,
	}, cres...)

	return cres
}
