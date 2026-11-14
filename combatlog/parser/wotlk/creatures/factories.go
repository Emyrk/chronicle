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
			// Tempest Keep
			NewKaelThasEncounterCharacter,
			// Black Temple
			NewReliquaryEncounterCharacter,
		)
		cres = append(tbc, cres...)
	}
	if flavor.Has(database.FlavorWrath) {
		wrath := characters.CreatureFactories(
			// Violet Hold
			NewVoidSentry,

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

			// Vault of Archavon
			NewEmalon,

			// Obsidian Sanctum
			NewSarthrion,

			// Eye of Eternity
			NewMalygos,
			NewNexusLord,
			NewScionOfEternity,
			NewPowerSpark,

			// Culling of Strathlome
			NewMalGanis,

			// Ruby Sanctum
			NewHalionCharacter,

			// Icecrown Citadel
			NewDeathspeakerHighPriest,
			NewLadyDeathwhisper,
			NewGunshipBattleCharacter,
			NewProfessorPutricide,
			NewValithriaDreamwalker,
			NewSindragosa,
			NewLichKing,

			// Ulduar,
			NewXT002,
			NewIgnisIronConstruct,
			NewAlgalon,
			NewAssemblyOfIronCharacter,
			NewRazorscaleAdd,
			NewFreyaEncounterCharacter,
			NewHodirEncounterCharacter,
			NewKologarnEncounterCharacter,
			NewSif,
			NewThorimEncounterCharacter,
			NewMimironBoomerXP500,
			NewMimironEncounterCharacter,
			NewYoggSaronGuardian,
			NewYoggSaronEncounterCharacter,
		)
		// Gunship objects, Putricide, Mechanolift, Vortex, Kologarn, Mimiron's
		// machines, and Yogg-Saron can use vehicle GUIDs, so they must not rely
		// solely on the CreatureFactories wrappers.
		wrath = append(wrath,
			NewXT002,
			NewGunshipBattleCharacter,
			NewProfessorPutricide,
			NewFlameLeviathan,
			NewMechanolift,
			NewVortex,
			NewKologarnEncounterCharacter,
			NewMimironEncounterCharacter,
			NewYoggSaronEncounterCharacter,
		)
		cres = append(wrath, cres...)
	}

	return cres
}

// GraphFactoryRecipe names the exact existing factory order, including creature-only
// wrappers and the direct vehicle fallbacks. It never runs a gameplay factory.
func GraphFactoryRecipe(flavor database.WoWFlavor) characters.TrustedFactoryRecipe {
	base := creatures.VanillaGraphFactoryRecipe(flavor)
	ids := base.FactoryIDs
	if flavor.Has(database.FlavorTBC, database.FlavorWrath) {
		ids = append([]string{
			"tbc/creature/NewAttumenTheHuntsman",
			"tbc/creature/NewCoilfangGuardian",
			"tbc/creature/NewTaintedElementals",
			"tbc/creature/NewMorogrimTidewalker",
			"tbc/creature/NewLeotherasTheBlind",
			"tbc/creature/NewKaelThasEncounterCharacter",
			"tbc/creature/NewReliquaryEncounterCharacter",
		}, ids...)
	}
	if flavor.Has(database.FlavorWrath) {
		ids = append([]string{
			"wrath/creature/NewVoidSentry",
			"wrath/creature/NewAzureEnforcer",
			"wrath/creature/NewCrazedManaWraith",
			"wrath/creature/NewMageHunterAscendant",
			"wrath/creature/NewCrystallineFrayer",
			"wrath/creature/NewOmarTheUnscarred",
			"wrath/creature/NewDrakkariFrenzy",
			"wrath/creature/NewClaw",
			"wrath/creature/NewEmalon",
			"wrath/creature/NewSarthrion",
			"wrath/creature/NewMalygos",
			"wrath/creature/NewNexusLord",
			"wrath/creature/NewScionOfEternity",
			"wrath/creature/NewPowerSpark",
			"wrath/creature/NewMalGanis",
			"wrath/creature/NewHalionCharacter",
			"wrath/creature/NewDeathspeakerHighPriest",
			"wrath/creature/NewLadyDeathwhisper",
			"wrath/creature/NewGunshipBattleCharacter",
			"wrath/creature/NewProfessorPutricide",
			"wrath/creature/NewValithriaDreamwalker",
			"wrath/creature/NewSindragosa",
			"wrath/creature/NewLichKing",
			"wrath/creature/NewXT002",
			"wrath/creature/NewIgnisIronConstruct",
			"wrath/creature/NewAlgalon",
			"wrath/creature/NewAssemblyOfIronCharacter",
			"wrath/creature/NewRazorscaleAdd",
			"wrath/creature/NewFreyaEncounterCharacter",
			"wrath/creature/NewHodirEncounterCharacter",
			"wrath/creature/NewKologarnEncounterCharacter",
			"wrath/creature/NewSif",
			"wrath/creature/NewThorimEncounterCharacter",
			"wrath/creature/NewMimironBoomerXP500",
			"wrath/creature/NewMimironEncounterCharacter",
			"wrath/creature/NewYoggSaronGuardian",
			"wrath/creature/NewYoggSaronEncounterCharacter",
			"wrath/direct/NewXT002",
			"wrath/direct/NewGunshipBattleCharacter",
			"wrath/direct/NewProfessorPutricide",
			"wrath/direct/NewFlameLeviathan",
			"wrath/direct/NewMechanolift",
			"wrath/direct/NewVortex",
			"wrath/direct/NewKologarnEncounterCharacter",
			"wrath/direct/NewMimironEncounterCharacter",
			"wrath/direct/NewYoggSaronEncounterCharacter",
		}, ids...)
	}
	return characters.TrustedFactoryRecipe{ID: "wotlk/characters/" + flavor.CanonicalKey(), FactoryIDs: ids, Factories: NewCharacterFactories(flavor)}
}
func AzerothCoreGraphFactoryRecipe() characters.TrustedFactoryRecipe {
	return characters.TrustedFactoryRecipe{ID: "azerothcore/characters/v1", FactoryIDs: []string{"NewTotemCharacter",
		"NewCritterCharacter",
		"NewObject",
		"NewLogBasedCharacter"}, Factories: AzerothServersideCoreCharacterFactories()}
}
