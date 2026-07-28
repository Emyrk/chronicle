package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/database"
)

// VanillaCharacterFactories returns the CharacterFactory list for vanilla
// WoW content. The flavor tags control which content-specific factories are
// included (e.g. Turtle-custom bosses, VanillaPlus encounters, Nightmare of
// Ursol content). Call with an empty flavor to get the base vanilla set.
func VanillaCharacterFactories(flavor database.WoWFlavor) []characters.CharacterFactory {
	cres := []characters.CharacterFactory{
		// ── Global (always included) ───────────────────────────────────
		NewTotemCharacter,
		NewCritterCharacter,
		NewObject,

		// ── Stock vanilla content ──────────────────────────────────────
		// Sunken Temple
		NewAtalalDeathwalkerSpirit,
		// Wailing Caverns
		NewDiscipleOfNaralex,
		// Deadmines
		NewSneedShredder,
		NewEdwinVanCleef,
		// Dire Maul
		NewImmolthar,
		EyeofImmolthar,
		NewKingGordok,
		// Molten Core
		NewCoreHoundCharacter,
		NewMajordomoPartyCharacter,
		NewIncindisCharacter,
		NewSonOfTheFlameCharacter,
		NewSulfuronHarbingerCharacter,
		NewSmoldarisBasaltharCharacter,
		NewSorcererThaneCharacter,
		NewRagnarosCharacter,
		NewCoreRager,
		NewGolemaggCharacter(flavor),
		// Blackwing Lair
		NewBroodlordLashlayer,
		NewRazorgore(flavor),
		NewShadowflameSpark,
		NewNefarian,
		NewVaelChained,
		// Onyxia
		NewOnyxiaCharacter(flavor),
		NewBroodcommanderAxelusCharacter(flavor),
		// Zul'Gurub
		NewHighPriestArlokk,
		NewHighPriestMarli,
		NewHighPriestessJeklik,
		NewHighPriestThekalParty,
		NewJindoHexxer,
		NewHooktoothFrenzy,
		// Scholomance
		NewJandiceBarov,
		NewDiseasedGhoul,
		// Stratholme
		NewCryptScarab,
		// AQ 40
		NewCthun,
		// Naxx
		NewGluth,
		NewGrobbulus,
		NewAnubRekhan,
		NewThaddiusParty,
		NewGothikRoom,
		NewKelThuzadRoom,
		NewHeiganTheUnclean,
		NewDiseasedMaggot,
		NewEyeStalk,
		// L/UBRS
		NewMotherSmolderweb,
	}

	// ── VanillaPlus content ────────────────────────────────────────
	if flavor.Has(database.FlavorVanillaPlus) {
		cres = append(cres,
			// SM (V+)
			NewVanillaPlusMograineCharacter,
			NewVanillaPlusSMSoul,
			NewVanillaPlusSMSoulHunter,
			NewVanillaPlusBrotherMicheal,
			NewVanillaPlusBloodaxeWorgPup,
			NewVanillaPlusScarletCharger,
			NewVanillaPlusScarletSharpshooter,
			NewVanillaPlusScarletSorcerer,
		)
	}

	// ── Nightmare of Ursol content (Turtle, OctoWoW) ───────────────
	if flavor.Has(database.FlavorNightmareOfUrsol) {
		cres = append(cres,
			// Timbermaw Hold
			NewKarrsh,
			NewChieftainPartath,
			NewOrmanos,
			NewUrsol,
			NewNightmareFiend,
			NewVileSkitterer,
			NewSelenaxxFoulheart,
			NewLoktanagTheVile,
			NewPerotharn,
		)
	}

	// ── Turtle WoW custom content ──────────────────────────────────
	if flavor.Has(database.FlavorTurtle) || flavor.Has(database.FlavorOctoWoW) || flavor.Has(database.FlavorNightmareOfUrsol) {
		cres = append(cres,
			// Kara 40
			NewNetherInfernal,
			NewKruul,
			NewKing,
			NewMephistroth,
			NewDemonicEye,
			NewSanvTasDal,
			NewDraeneiNetherWalker,
			NewKeeperGnarlmoon,
			NewAnomalus,
			NewEchoOfMedivh,
			NewFragmentOfRupturan,
			NewRupturanTheBroken,
			NewFelheart,
			NewLivingStone,
			NewIncantagos,
			// Emerald Sanctum
			NewSolnius,
		)
	}

	return cres
}

// TurtleCharacterFactories is a convenience alias for
// VanillaCharacterFactories with the full Turtle flavor set.
// Deprecated: prefer VanillaCharacterFactories(flavor) for new code.
func TurtleCharacterFactories() []characters.CharacterFactory {
	return VanillaCharacterFactories(database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorNightmareOfUrsol,
		database.FlavorTurtle,
	})
}
