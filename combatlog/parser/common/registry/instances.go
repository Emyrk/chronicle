package registry

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
)

func RegisterNightmareOfUrsol(r *Registry) *Registry {
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

func RegisterVanillaPlus(r *Registry) {
	r.DeleteEntry("Scarlet Monastery")
	r.DeleteEntry("Scarlet Monastery Graveyard")
	r.DeleteEntry("Scarlet Monastery Library")
	r.DeleteEntry("Scarlet Monastery Armory")
	r.DeleteEntry("Scarlet Monastery Cathedral")
	r.RegisterEntry(FromCommonFactory(instances.ScarletMonasteryArmoryVPRaid))
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
	r.RegisterEntry(FromCommonFactory(instances.BlackrockDepthsFactory))
	r.RegisterEntry(FromCommonFactory(instances.ScholomanceFactory))
	r.RegisterEntry(FromCommonFactory(instances.StratholmeFactory))
	r.RegisterEntry(FromCommonFactory(instances.DireMaulFactory))
	r.RegisterEntry(FromCommonFactory(instances.StormwindVaultFactory))
	r.RegisterEntry(FromCommonFactory(instances.StockadesFactory))
	r.RegisterEntry(FromCommonFactory(instances.SunkenTempleFactory))
	r.RegisterEntry(FromCommonFactory(instances.ZulFarrakFactory))
	r.RegisterEntry(FromCommonFactory(instances.BlackfathomDeepsFactory))
	r.RegisterEntry(FromCommonFactory(instances.UldamanFactory))
	r.RegisterEntry(FromCommonFactory(instances.GnomereganFactory))
	r.RegisterEntry(FromCommonFactory(instances.MaraudonFactory))
	r.RegisterEntry(FromCommonFactory(instances.RazorfenDownsFactory))

	r.RegisterEntry(FromCommonFactory(instances.BlackrockSpireFactory))

	// 10 man

	// 20 man
	r.RegisterEntry(FromCommonFactory(instances.ZulGurubFactory))
	r.RegisterEntry(FromCommonFactory(instances.RuinsOfAhnQirajFactory))

	// 40 man
	r.RegisterEntry(FromCommonFactory(instances.MoltenCoreFactory))
	r.RegisterEntry(FromCommonFactory(instances.OnyxiaFactory))
	r.RegisterEntry(FromCommonFactory(instances.TempleOfAhnQirajFactory))
	r.RegisterEntry(FromCommonFactory(instances.BlackwingLairFactory))
	r.RegisterEntry(FromCommonFactory(instances.NaxxramasFactory))
}
