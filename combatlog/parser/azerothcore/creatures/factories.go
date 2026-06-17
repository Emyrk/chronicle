package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/creatures"
	"github.com/Emyrk/chronicle/database"
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

func NewAzerothCoreCharacterFactories(flavor database.WoWFlavor) []characters.CharacterFactory {
	cres := creatures.VanillaCharacterFactories(flavor)

	cres = append([]characters.CharacterFactory{
		// The Nexus
		NewAzureEnforcer,
		NewCrazedManaWraith,
		NewMageHunterAscendant,
		NewCrystallineFrayer,

		// Hellfire Ramparts
		NewOmarTheUnscarred,

		// Gundrak
		NewDrakkariFrenzy,

		// TBC

		// Underbog
		NewClaw,

		// Obsidian Sanctum
		NewSarthrion,
	}, cres...)

	return cres
}
