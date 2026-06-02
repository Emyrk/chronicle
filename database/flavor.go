package database

// WoWFlavor is the server-mechanics axis split out of LogType (format vs flavor
// vs dataset). A flavor is a *set of capability tags*, not a scalar: servers
// overlap and split on the edges (e.g. Turtle/Kronos/VanillaPlus share most
// behavior but differ at the margins), so mechanics are gated by tag membership
// (flavor.Has(tag)) rather than an inheritance hierarchy. See TODO_DATASETS.md
// "Log Format / Flavor Split".
//
// Tags are matched by membership only; there are no boolean expressions. A
// mechanic is tagged with the broadest tag it needs (FlavorWrath for shared
// WotLK behavior; FlavorAzerothcore for an AzerothCore-specific quirk), and
// overrides are handled in code at the mechanic site by checking the more
// specific (edge) tag before the base tag.
type WoWFlavor []FlavorTag

// FlavorTag is a single behavior characteristic a server may satisfy.
type FlavorTag string

const (
	// FlavorVanilla is 1.12-era behavior (Turtle, Kronos, VanillaPlus, ...).
	FlavorVanilla FlavorTag = "vanilla"
	// FlavorWrath is 3.3.5a (WotLK)-era behavior (Warmane, Epoch, AzerothCore).
	FlavorWrath FlavorTag = "wrath"
	// FlavorTurtle is Turtle WoW-specific behavior.
	FlavorTurtle FlavorTag = "turtle"
	// FlavorKronos is Kronos-specific behavior.
	FlavorKronos FlavorTag = "kronos"
	// FlavorEpoch is Project Epoch-specific behavior.
	FlavorEpoch FlavorTag = "epoch"
	// FlavorAzerothcore is AzerothCore-specific behavior (server-side or
	// client-side; distinguish the two via LogFormat, not this tag).
	FlavorAzerothcore FlavorTag = "azerothcore"
)

// Has reports whether the flavor includes tag.
func (f WoWFlavor) Has(tag FlavorTag) bool {
	for _, t := range f {
		if t == tag {
			return true
		}
	}
	return false
}

// Flavor returns the bootstrap flavor tag set for a LogType.
//
// NOTE: this derivation is a temporary bridge. Flavor's permanent source of
// truth is per-tenant runtime configuration (resolved server > tenant, like
// datasets); until that exists, the parser derives a sensible default flavor
// from the already-known LogType so mechanics can be gated on tags today.
// Because there is no persisted flavor column yet, changing these tag sets is a
// pure code edit.
//
// An unknown LogType returns nil (Has is always false).
func (e LogType) Flavor() WoWFlavor {
	switch e {
	case LogTypeV1:
		return WoWFlavor{FlavorVanilla, FlavorTurtle}
	case LogTypeV2:
		return WoWFlavor{FlavorVanilla}
	case LogTypeKronos:
		return WoWFlavor{FlavorVanilla, FlavorKronos}
	case LogTypeWarmane:
		return WoWFlavor{FlavorWrath}
	case LogTypeEpoch:
		return WoWFlavor{FlavorWrath, FlavorEpoch}
	case LogTypeAzerothcoreClientside, LogTypeAzerothcore:
		return WoWFlavor{FlavorWrath, FlavorAzerothcore}
	}
	return nil
}
