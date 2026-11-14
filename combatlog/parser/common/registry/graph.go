package registry

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	vanillacreatures "github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	wotlkcreatures "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures"
	wotlkinstances "github.com/Emyrk/chronicle/combatlog/parser/wotlk/instances"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// PreparedGraph freezes the trusted production registry recipes before parsing.
// Keep it for the lifetime of a capture session; restore may use a fresh preparation.
// Preparation evaluates configuration callbacks, but semantic restore never does.
type PreparedGraph struct {
	recipe      *encounters.GraphRecipe
	hooks       []*instances.HookableGraphRecipe
	identifiers []identifier.TrustedRecipe
	factories   characters.TrustedFactoryRecipe
	speedruns   []rankings.SpeedrunRules
	format      database.LogFormat
	flavor      database.WoWFlavor
	acore       *AzerothCoreGraphAdapter
}

// AzerothCoreGraphAdapter supplies the existing typed hook without an import
// cycle. Only this fixed hook ID/format is admitted; archive data cannot supply it.
type AzerothCoreGraphAdapter struct {
	Hook         instances.HookGraphRecipe
	RegisterHook func(*ownergraph.Registry) error
}

func (r *Registry) PrepareGraph(format database.LogFormat, modifiers *chrondbc.DurationModifierSet, catalog consumeevidence.ConsumableCatalog, spells gamedb.SpellFetcher) (*PreparedGraph, error) {
	return r.prepareGraph(format, modifiers, catalog, spells, nil)
}
func (r *Registry) PrepareAzerothCoreGraph(modifiers *chrondbc.DurationModifierSet, catalog consumeevidence.ConsumableCatalog, spells gamedb.SpellFetcher, adapter AzerothCoreGraphAdapter) (*PreparedGraph, error) {
	if adapter.Hook.ID != "azerothcore.instanceHook" || adapter.Hook.New == nil || adapter.Hook.Validate == nil || adapter.RegisterHook == nil {
		return nil, fmt.Errorf("invalid AzerothCore graph adapter")
	}
	return r.prepareGraph(database.LogFormatAzerothcoreMod, modifiers, catalog, spells, &adapter)
}
func (r *Registry) prepareGraph(format database.LogFormat, modifiers *chrondbc.DurationModifierSet, catalog consumeevidence.ConsumableCatalog, spells gamedb.SpellFetcher, acore *AzerothCoreGraphAdapter) (*PreparedGraph, error) {
	if r == nil || r.fallback != nil {
		return nil, fmt.Errorf("graph requires a registry without fallback")
	}
	switch format {
	case database.LogFormatAzerothcoreMod:
		if acore == nil || len(r.flavor) == 0 {
			return nil, fmt.Errorf("unsupported graph log format %s without AzerothCore adapter", format)
		}
	case database.LogFormat112aCcAddon, database.LogFormat112aSuperwowAddon:
		if !r.flavor.Has(database.FlavorVanilla) || r.flavor.Has(database.FlavorTBC, database.FlavorWrath) {
			return nil, fmt.Errorf("invalid vanilla graph flavor")
		}
	case database.LogFormat243CcAddon:
		if !r.flavor.Has(database.FlavorTBC) {
			return nil, fmt.Errorf("invalid TBC graph flavor")
		}
	case database.LogFormat335aCcAddon:
		if !r.flavor.Has(database.FlavorWrath) {
			return nil, fmt.Errorf("invalid Wrath graph flavor")
		}
	case database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
		if len(r.flavor) == 0 {
			return nil, fmt.Errorf("missing graph flavor")
		}
	default:
		return nil, fmt.Errorf("unsupported graph log format %s", format)
	}
	for _, tag := range r.flavor {
		switch tag {
		case database.FlavorVanilla, database.FlavorTBC, database.FlavorWrath, database.FlavorTurtle, database.FlavorKronos, database.FlavorVanillaPlus, database.FlavorOctoWoW, database.FlavorNightmareOfUrsol, database.FlavorWoWForever, database.FlavorAzerothcore, database.FlavorEpoch, database.FlavorAzerothcoreProgression, database.FlavorChromieCraft:
		default:
			return nil, fmt.Errorf("unsupported graph flavor %s", tag)
		}
	}
	p := &PreparedGraph{format: format, flavor: slices.Clone(r.flavor), acore: acore}
	p.factories = wotlkcreatures.GraphFactoryRecipe(p.flavor)
	if acore != nil {
		p.factories = wotlkcreatures.AzerothCoreGraphFactoryRecipe()
	}
	if len(p.factories.FactoryIDs) != len(p.factories.Factories) {
		return nil, fmt.Errorf("graph factory recipe drift")
	}
	names := make([]string, 0, len(r.entries))
	for name, entry := range r.entries {
		if entry == nil || entry.commonFactory == nil {
			return nil, fmt.Errorf("opaque instance factory %q", name)
		}
		names = append(names, name)
	}
	if len(names) == 0 && acore == nil {
		return nil, fmt.Errorf("graph requires at least one instance recipe")
	}
	sort.Strings(names)
	prepared := make([]*instances.PreparedCommonGraph, 0, len(names))
	seen := map[string]bool{}
	collect := func(rules *rankings.Rankings) {
		if rules != nil && rules.Speedrun != nil {
			p.speedruns = append(p.speedruns, *rules.Speedrun)
		}
	}
	for _, name := range names {
		f, err := r.entries[name].commonFactory.PrepareGraph(format, p.flavor, p.factories)
		if err != nil {
			return nil, fmt.Errorf("prepare %s: %w", name, err)
		}
		for _, f := range append([]*instances.PreparedCommonGraph{f}, f.Variants...) {
			if seen[f.Hook.ID] {
				return nil, fmt.Errorf("duplicate graph recipe %s", f.Hook.ID)
			}
			seen[f.Hook.ID] = true
			if acore != nil {
				f.Hook.SuffixHooks = []instances.HookGraphRecipe{acore.Hook}
			}
			prepared = append(prepared, f)
			p.hooks = append(p.hooks, f.Hook)
			p.identifiers = append(p.identifiers, f.Identifier)
			collect(f.Hook.Rankings)
			derived := make([]string, 0, len(f.Hook.DerivedRankings))
			for name := range f.Hook.DerivedRankings {
				derived = append(derived, name)
			}
			sort.Strings(derived)
			for _, name := range derived {
				collect(f.Hook.DerivedRankings[name])
			}
		}
	}
	var fallback *instances.PreparedCommonGraph
	if acore != nil {
		fallback = &instances.PreparedCommonGraph{
			Hook:       &instances.HookableGraphRecipe{ID: instances.AzerothCoreFallbackRecipeID, AzerothCoreFallback: true, Format: format, Flavor: slices.Clone(p.flavor), Factories: p.factories, PrefixHooks: []instances.HookGraphRecipe{acore.Hook}},
			Identifier: identifier.TrustedRecipe{ID: instances.AzerothCoreFallbackRecipeID, Factory: func() *identifier.Identifier { return identifier.NewIdentifier(map[uint32]instances.Identity{}) }},
		}
		p.hooks = append(p.hooks, fallback.Hook)
		p.identifiers = append(p.identifiers, fallback.Identifier)
	}
	ids := make([]string, len(p.hooks))
	for i, hook := range p.hooks {
		ids[i] = hook.ID
	}
	identity, err := json.Marshal(struct {
		Names       []string
		Identifiers []string
	}{Names: names, Identifiers: ids})
	if err != nil {
		return nil, err
	}
	p.recipe = &encounters.GraphRecipe{ID: fmt.Sprintf("registry/production/v1/%s/%s/%x", format, p.flavor.CanonicalKey(), sha256.Sum256(identity)), DurationModifiers: modifiers, Catalog: catalog, Spells: spells}
	p.recipe.Resolve = func(ctx context.Context, logger *slog.Logger, verbose bool, z zone.Zone, units *unitdb.Units) *instances.Hookable {
		for _, factory := range prepared {
			if !factory.Hook.MatchesZone(z) {
				continue
			}
			h, err := factory.New(parseoptions.WithVerbose(ctx, verbose), logger, units, z)
			if err != nil {
				panic(fmt.Sprintf("prepared instance construction: %v", err))
			}
			return h
		}
		if fallback != nil {
			h, err := fallback.New(parseoptions.WithVerbose(ctx, verbose), logger, units, z)
			if err != nil {
				panic(fmt.Sprintf("prepared AzerothCore fallback: %v", err))
			}
			return h
		}
		return nil
	}
	return p, nil
}

// RecipeID identifies the prepared registry's format, flavor and admitted factories.
func (p *PreparedGraph) RecipeID() string {
	if p == nil || p.recipe == nil {
		return ""
	}
	return p.recipe.ID
}

func (p *PreparedGraph) NewEncounterState(ctx context.Context, logger *slog.Logger) (*encounters.State, error) {
	if p == nil || p.recipe == nil {
		return nil, fmt.Errorf("nil prepared graph")
	}
	format, _ := parsectx.Format(ctx)
	flavor, _ := parsectx.Flavor(ctx)
	if format != p.format || flavor.CanonicalKey() != p.flavor.CanonicalKey() {
		return nil, fmt.Errorf("encounter context format/flavor mismatch")
	}
	return p.recipe.New(ctx, logger)
}

// RegisterOwners registers encounter dependencies only. Session composition owns
// source and consumer codecs. Hookable registration includes metadata codecs.
func (p *PreparedGraph) RegisterOwners(r *ownergraph.Registry, compatibility snapshot.Compatibility, captureState *encounters.State) error {
	if r == nil {
		return fmt.Errorf("nil owner registry")
	}
	if p == nil || p.recipe == nil {
		return fmt.Errorf("nil prepared graph")
	}
	if compatibility.Format != string(p.format) || compatibility.Flavor != p.flavor.CanonicalKey() {
		return fmt.Errorf("encounter graph compatibility mismatch")
	}
	a := auras.GraphOptions{DurationModifiers: p.recipe.DurationModifiers, Compatibility: compatibility}
	if captureState != nil {
		a.ObserverTracking = captureState.Auras
	}
	definitions := map[string]*phases.EncounterPhases{}
	for _, def := range []*phases.EncounterPhases{vanillacreatures.KelThuzadPhaseDefinitions, vanillacreatures.NefarianPhaseDefinitions, vanillacreatures.RazorgorePhaseDefinitions, wotlkcreatures.MimironPhaseDefinitions, wotlkcreatures.ThorimPhaseDefinitions, wotlkcreatures.ReliquaryPhaseDefinitions, wotlkcreatures.KaelThasPhaseDefinitions, wotlkcreatures.YoggSaronPhaseDefinitions, wotlkcreatures.LadyDeathwhisperPhaseDefinitions, wotlkcreatures.ProfessorPutricidePhaseDefinitions, wotlkcreatures.SindragosaPhaseDefinitions, wotlkcreatures.LichKingPhaseDefinitions} {
		definitions[def.EncounterName] = def
	}
	registrations := []func() error{
		func() error { return encounters.RegisterGraphOwner(r, p.recipe) },
		func() error { return instances.RegisterHookableGraphOwner(r, p.hooks...) },
		func() error {
			if p.acore != nil {
				return identifier.RegisterServerClassificationGraphOwner(r, p.identifiers...)
			}
			return identifier.RegisterGraphOwner(r, p.identifiers...)
		},
		func() error { return auras.RegisterGraphOwners(r, a) },
		func() error {
			return consumeevidence.RegisterGraphOwners(r, consumeevidence.GraphOptions{Catalog: p.recipe.Catalog, Compatibility: compatibility})
		},
		func() error {
			return characters.RegisterGraphOwners(r, characters.GraphOptions{Factories: p.factories, ValidateRuntime: instances.ValidateHookableCharactersRuntime})
		},
		func() error { return characters.RegisterWrapperGraphOwners(r) },
		func() error { return characters.RegisterAdsGraphOwner(r) },
		func() error { return period.RegisterGraphOwners(r) },
		func() error { return vanillacreatures.RegisterGraphOwners(r) },
		func() error { return instances.RegisterOngoingFightGraphOwner(r) },
		func() error { return instances.RegisterPhaseTrackerGraphOwner(r, definitions) },
		func() error { return instances.RegisterUnitTelemetryGraphOwner(r) },
		func() error { return rankings.RegisterSpeedrunGraphOwner(r, p.speedruns) },
		func() error { return rankings.RegisterDPSGraphOwner(r) },
		func() error { return rankings.RegisterSurvivabilityGraphOwner(r) },
		func() error { return rankings.RegisterEngagementGraphOwner(r) },
		func() error { return overviewmetrics.RegisterGraphOwner(r) },
		func() error { return zoner.RegisterGraphOwner(r) },
		func() error { return unitdb.RegisterGraphOwner(r) },
		func() error { return messages.RegisterDamageGraphOwner(r) },
		func() error { return encounterevents.RegisterGraphOwners(r) },
		func() error { return loot.RegisterGraphOwners(r) },
		func() error { return armory.RegisterGraphOwner(r) },
		func() error { return participants.RegisterGraphOwner(r) },
		func() error { return vehicles.RegisterGraphOwner(r) },
		func() error { return raidgroups.RegisterGraphOwner(r) },
	}

	if p.acore != nil || p.flavor.Has(database.FlavorTBC, database.FlavorWrath) {
		registrations = append(registrations, func() error { return wotlkcreatures.RegisterGraphOwners(r) })
	}
	if p.acore != nil {
		registrations = append(registrations, func() error { return p.acore.RegisterHook(r) })
	}
	preprocessors := map[string]bool{}
	for _, hook := range p.hooks {
		for _, recipe := range hook.Preprocessors {
			preprocessors[recipe.ID] = true
		}
	}
	for _, candidate := range []struct {
		id       string
		register func(*ownergraph.Registry) error
	}{
		{wotlkinstances.SartharionPreprocessorGraphRecipe().ID, wotlkinstances.RegisterSartharionPreprocessorGraphOwner},
		{wotlkinstances.ThorimPreprocessorGraphRecipe().ID, wotlkinstances.RegisterThorimPreprocessorGraphOwner},
		{wotlkinstances.MalygosPreprocessorGraphRecipe().ID, wotlkinstances.RegisterMalygosPreprocessorGraphOwner},
		{wotlkinstances.IcecrownPreprocessorGraphRecipe().ID, wotlkinstances.RegisterIcecrownPreprocessorGraphOwner},
	} {
		if preprocessors[candidate.id] {
			registrations = append(registrations, func() error { return candidate.register(r) })
			delete(preprocessors, candidate.id)
		}
	}
	if len(preprocessors) != 0 {
		return fmt.Errorf("unsupported production preprocessor recipe")
	}
	for _, register := range registrations {
		if err := register(); err != nil {
			return err
		}
	}
	return nil
}
