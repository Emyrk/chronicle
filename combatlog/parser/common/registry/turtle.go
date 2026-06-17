package registry

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
)

func TurtleRegistry(logger *slog.Logger) *Registry {
	r := NewRegistry(logger)

	RegisterClassicEncounters(r)

	// 5 man
	r.RegisterEntry(FromCommonFactory(instances.WindhornCanyonFactory))
	r.RegisterEntry(FromCommonFactory(instances.BlackMorassFactory))
	r.RegisterEntry(FromCommonFactory(instances.FrostmaneHollowFactory).WithComment("units registered"))

	// 10 man
	r.RegisterEntry(FromCommonFactory(instances.TowerOfKarazhanFactory).WithComment("Upper tower is not completely supported yet"))

	// 20 man
	r.RegisterEntry(FromCommonFactory(instances.TimbermawHoldFactory).WithComment("not yet complete"))

	// 40 man
	r.RegisterEntry(FromCommonFactory(instances.EmeraldSanctumFactory))
	return r
}

func RegisterClassicEncounters(r *Registry) {
	// Register instances here as you add them
	// 5 man
	r.RegisterEntry(FromCommonFactory(instances.DeadminesFactory))
	r.RegisterEntry(FromCommonFactory(instances.WailingCavernsFactory))
	r.RegisterEntry(FromCommonFactory(instances.ShadowfangKeepFactory))
	r.RegisterEntry(FromCommonFactory(instances.RazorfenKraulFactory))
	r.RegisterEntry(FromCommonFactory(instances.RagefireChasmFactory))
	r.RegisterEntry(FromCommonFactory(instances.ScarletMonasteryGraveyardFactory))
	r.RegisterEntry(FromCommonFactory(instances.ScarletMonasteryLibraryFactory))
	r.RegisterEntry(FromCommonFactory(instances.ScarletMonasteryArmoryFactory))
	r.RegisterEntry(FromCommonFactory(instances.ScarletMonasteryCathedralFactory))
	r.RegisterEntry(FromCommonFactory(instances.AllScarletMonasteryFactory))
	r.RegisterEntry(FromCommonFactory(instances.BlackrockDepthsFactory).WithComment("Most bosses & mobs are not yet supported"))
	r.RegisterEntry(FromCommonFactory(instances.ScholomanceFactory).WithComment("**new** not fully implemented"))
	r.RegisterEntry(FromCommonFactory(instances.StratholmeFactory).WithComment("Only undead side, mechanics not implemented"))
	r.RegisterEntry(FromCommonFactory(instances.DireMaulFactory))
	r.RegisterEntry(FromCommonFactory(instances.StormwindVaultFactory))
	r.RegisterEntry(FromCommonFactory(instances.StockadesFactory))
	r.RegisterEntry(FromCommonFactory(instances.SunkenTempleFactory).WithComment("not yet complete"))
	r.RegisterEntry(FromCommonFactory(instances.ZulFarrakFactory))
	r.RegisterEntry(FromCommonFactory(instances.BlackfathomDeepsFactory).WithComment("needs review"))
	r.RegisterEntry(FromCommonFactory(instances.UldamanFactory).WithComment("needs review"))
	r.RegisterEntry(FromCommonFactory(instances.GnomereganFactory).WithComment("needs review"))
	r.RegisterEntry(FromCommonFactory(instances.MaraudonFactory).WithComment("needs review"))
	r.RegisterEntry(FromCommonFactory(instances.RazorfenDownsFactory).WithComment("needs review"))

	r.RegisterEntry(FromCommonFactory(instances.BlackrockSpireFactory).WithComment("units registered"))

	// 10 man

	// 20 man
	r.RegisterEntry(FromCommonFactory(instances.ZulGurubFactory))
	r.RegisterEntry(FromCommonFactory(instances.RuinsOfAhnQirajFactory).WithComment("**NOT** yet implemented, just registered the mobs"))

	// 40 man
	r.RegisterEntry(FromCommonFactory(instances.MoltenCoreFactory))
	r.RegisterEntry(FromCommonFactory(instances.OnyxiaFactory))
	r.RegisterEntry(FromCommonFactory(instances.TempleOfAhnQirajFactory).WithComment("**NOT** yet implemented, just registered the mobs"))
	r.RegisterEntry(FromCommonFactory(instances.BlackwingLairFactory).WithComment("**new** mobs registered, mechanics not implemented"))
	r.RegisterEntry(FromCommonFactory(instances.NaxxramasFactory).WithComment("**new** mobs registered, mechanics not implemented"))
}
