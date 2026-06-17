package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
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
	if flavor.Has(database.FlavorWrath) {
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

			// Underbog
			NewClaw,

			// Obsidian Sanctum
			NewSarthrion,

			// Eye of Eternity
			NewMalygos,
			NewPowerSpark,
		}, cres...)
	}

	return cres
}
