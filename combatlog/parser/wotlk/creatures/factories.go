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

// TODO: Move this to common
func NewCharacterFactories(flavor database.WoWFlavor) []characters.CharacterFactory {
	cres := creatures.VanillaCharacterFactories(flavor)
	if flavor.Has(database.FlavorTBC, database.FlavorWrath) {
		tbc := characters.CreatureFactories(
			// Karazhan
			NewAttumenTheHuntsman,
			// Serpentshrine Cavern
			NewCoilfangGuardian,
			NewTaintedElementals,
			NewMorogrimTidewalker,
			NewLeotherasTheBlind,
		)
		cres = append(tbc, cres...)
	}
	if flavor.Has(database.FlavorWrath) {
		wrath := characters.CreatureFactories(
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
			NewNexusLord,
			NewScionOfEternity,
			NewPowerSpark,

			// Ulduar
			NewAssemblyOfIronCharacter,
			NewRazorscaleAdd,
			NewFreyaEncounterCharacter,
			NewHodirEncounterCharacter,
			NewKologarnEncounterCharacter,
			NewSif,
			NewThorimEncounterCharacter,
			NewMimironEncounterCharacter,
			NewYoggSaronGuardian,
			NewYoggSaronEncounterCharacter,
		)
		// Mechanolift, Vortex, Kologarn, Mimiron's machines, and Yogg-Saron can use
		// vehicle GUIDs, so they must not rely solely on the CreatureFactories wrappers.
		wrath = append(wrath, NewMechanolift, NewVortex, NewKologarnEncounterCharacter, NewMimironEncounterCharacter, NewYoggSaronEncounterCharacter)
		cres = append(wrath, cres...)
	}

	return cres
}
