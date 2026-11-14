package encounters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// PrepareGraph composes the production registry-first / server-classified
// fallback encounter behavior. Preparation freezes trusted rules; restore never
// invokes the gameplay factories or resolves a recipe from archive functions.
func PrepareGraph(reg *registry.Registry, modifiers *chrondbc.DurationModifierSet, catalog consumeevidence.ConsumableCatalog, spells gamedb.SpellFetcher) (*registry.PreparedGraph, error) {
	return reg.PrepareAzerothCoreGraph(modifiers, catalog, spells, registry.AzerothCoreGraphAdapter{Hook: AzerothCoreHookGraphRecipe(), RegisterHook: RegisterAzerothCoreHookGraphOwner})
}
