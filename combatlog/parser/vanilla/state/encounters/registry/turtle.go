package registry

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
)

func TurtleRegistry(logger *slog.Logger) *Registry {
	r := NewRegistry(logger)

	// Register instances here as you add them
	// 5 man
	r.Register(wrap(instances.WindhornCanyon))
	r.Register(wrap(instances.Deadmines))
	r.Register(wrap(instances.WailingCaverns))
	r.Register(wrap(instances.RazorfenKraul))
	r.Register(wrap(instances.RagefireChasm))
	r.Register(wrap(instances.ScarletMonasteryCathedral))
	r.Register(wrap(instances.ScarletMonasteryLibrary))
	r.RegisterWithComment(wrap(instances.BlackrockDepths), "Most bosses & mobs are not yet supported")
	r.RegisterWithComment(wrap(instances.Scholomance), "**new** not fully implemented")
	r.Register(wrap(instances.BlackMorass))
	r.RegisterWithComment(wrap(instances.Stratholme), "Only undead side, mechanics not implemented")
	r.Register(wrap(instances.DireMaul))
	r.Register(wrap(instances.StormwindVault))
	r.Register(wrap(instances.Stockades))
	r.RegisterWithComment(wrap(instances.SunkenTemple), "not yet complete")
	r.RegisterWithComment(wrap(instances.FrostmaneHollow), "units registered")

	r.RegisterWithComment(wrap(instances.BlackrockSpire), "Only upper spire is supported at the moment")

	// 10 man
	r.RegisterWithComment(wrap(instances.TowerOfKarazhan), "Upper tower is not completely supported yet")

	// 20 man
	r.Register(wrap(instances.ZulGurub))
	r.RegisterWithComment(wrap(instances.RuinsOfAhnQiraj), "**NOT** yet implemented, just registered the mobs")
	r.RegisterWithComment(wrap(instances.TimbermawHold), "not yet complete")

	// 40 man
	r.Register(wrap(instances.MoltenCore))
	r.Register(wrap(instances.Onyxia))
	r.Register(wrap(instances.EmeraldSanctum))
	r.RegisterWithComment(wrap(instances.TempleOfAhnQiraj), "**NOT** yet implemented, just registered the mobs")
	r.RegisterWithComment(wrap(instances.BlackwingLair), "**new** mobs registered, mechanics not implemented")
	r.RegisterWithComment(wrap(instances.Naxxramas), "**new** mobs registered, mechanics not implemented")

	return r
}
