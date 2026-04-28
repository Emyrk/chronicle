package registry

import (
	"log/slog"

	classic "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/warmane/instances"
)

func WarmaneStaticRegistry(logger *slog.Logger) *Registry {
	r := NewRegistry(logger)

	// Dungeons
	r.RegisterEntry(FromCommonFactory(instances.NexusFactory))
	r.RegisterEntry(FromCommonFactory(instances.OculusFactory))
	r.RegisterEntry(FromCommonFactory(instances.ForgeOfSoulsFactory))
	r.RegisterEntry(FromCommonFactory(instances.HallsOfReflectionFactory))
	r.RegisterEntry(FromCommonFactory(classic.DeadminesFactory))
	r.RegisterEntry(FromCommonFactory(classic.ShadowfangKeepFactory).WithComment("Boss-first coverage from world creature templates; trash is not yet exhaustive"))
	r.RegisterEntry(FromCommonFactory(classic.WailingCavernsFactory))
	r.RegisterEntry(FromCommonFactory(classic.RazorfenKraulFactory))
	r.RegisterEntry(FromCommonFactory(classic.RagefireChasmFactory))
	r.RegisterEntry(FromCommonFactory(classic.ScarletMonasteryCathedralFactory))
	r.RegisterEntry(FromCommonFactory(classic.ScarletMonasteryLibraryFactory))
	r.RegisterEntry(FromCommonFactory(classic.BlackrockDepthsFactory).WithComment("Most bosses & mobs are not yet supported"))
	r.RegisterEntry(FromCommonFactory(classic.ScholomanceFactory).WithComment("**new** not fully implemented"))
	r.RegisterEntry(FromCommonFactory(classic.BlackMorassFactory))
	r.RegisterEntry(FromCommonFactory(classic.StratholmeFactory).WithComment("Only undead side, mechanics not implemented"))
	r.RegisterEntry(FromCommonFactory(classic.DireMaulFactory))
	r.RegisterEntry(FromCommonFactory(classic.StockadesFactory))
	r.RegisterEntry(FromCommonFactory(classic.ZulFarrakFactory))
	r.RegisterEntry(FromCommonFactory(classic.SunkenTempleFactory).WithComment("not yet complete"))
	r.RegisterEntry(FromCommonFactory(classic.BlackrockSpireFactory).WithComment("Only upper spire is supported at the moment"))

	// Raids
	r.RegisterEntry(FromCommonFactory(classic.ZulGurubFactory))
	r.RegisterEntry(FromCommonFactory(classic.RuinsOfAhnQirajFactory).WithComment("**NOT** yet implemented, just registered the mobs"))
	r.RegisterEntry(FromCommonFactory(classic.MoltenCoreFactory))
	r.RegisterEntry(FromCommonFactory(classic.OnyxiaFactory))
	r.RegisterEntry(FromCommonFactory(classic.EmeraldSanctumFactory))
	r.RegisterEntry(FromCommonFactory(classic.TempleOfAhnQirajFactory).WithComment("**NOT** yet implemented, just registered the mobs"))
	r.RegisterEntry(FromCommonFactory(classic.BlackwingLairFactory).WithComment("**new** mobs registered, mechanics not implemented"))

	r.RegisterEntry(FromCommonFactory(instances.VoAFactory))
	r.RegisterEntry(FromCommonFactory(instances.ObsidianSanctumFactory))
	r.RegisterEntry(FromCommonFactory(instances.EyeOfEternityFactory))
	r.RegisterEntry(FromCommonFactory(instances.TrialOfTheCrusaderFactory).WithComment("Bosses and major adds registered; faction champions are not exhaustive"))
	r.RegisterEntry(FromCommonFactory(instances.RubySanctumFactory))
	r.RegisterEntry(FromCommonFactory(instances.NaxxramasFactory))

	return r
}
