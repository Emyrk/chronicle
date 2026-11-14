package instances

import (
	"context"
	"fmt"
	"log/slog"
	"maps"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

// PreparedCommonGraph is a trusted, preloaded factory recipe. Preparation may
// evaluate static configuration callbacks; semantic graph restore never does.
type PreparedCommonGraph struct {
	Hook         *HookableGraphRecipe
	Identifier   identifier.TrustedRecipe
	defaultMapID uint32
	Variants     []*PreparedCommonGraph
}

// PrepareGraph admits only explicitly annotated CommonFactory definitions.
// Dynamic names and preprocessors need their own explicit recipe contracts and
// are rejected rather than treating arbitrary function values as portable.
func (f *CommonFactory) PrepareGraph(format database.LogFormat, flavor database.WoWFlavor, factories characters.TrustedFactoryRecipe) (*PreparedCommonGraph, error) {
	if f == nil || f.GraphID == "" || f.Hostiles == nil {
		return nil, fmt.Errorf("factory has no trusted graph metadata")
	}
	if (f.NameFromZone != nil) != (f.GraphZoneName != "") || (f.GraphZoneName != "" && f.GraphZoneName != ZoneNameRecipeOnyxiaProgression) || (f.Preprocessors != nil) != (len(f.GraphPreprocessors) > 0) {
		return nil, fmt.Errorf("factory %s has unsupported dynamic name/preprocessor recipe", f.GraphID)
	}
	if (f.EncounterVariant != nil) != (f.GraphEncounterVariant != nil) || (f.GraphEncounterVariant != nil && (f.GraphEncounterVariant.ID == "" || f.GraphEncounterVariant.Classify == nil)) {
		return nil, fmt.Errorf("factory %s has unsupported encounter variant recipe", f.GraphID)
	}
	// Verify the explicit ordered recipes against the existing constructor during
	// trusted preparation. Neither this factory nor recipe.New runs on restore.
	if f.Preprocessors != nil {
		owners := f.Preprocessors()
		if len(owners) != len(f.GraphPreprocessors) {
			return nil, fmt.Errorf("factory %s preprocessor recipe count mismatch", f.GraphID)
		}
		for i, recipe := range f.GraphPreprocessors {
			if recipe.ID == "" || recipe.New == nil || recipe.Validate == nil || !recipe.Validate(owners[i]) {
				return nil, fmt.Errorf("factory %s preprocessor recipe mismatch at %d", f.GraphID, i)
			}
		}
	}
	// Freeze matching inputs, rather than retaining the mutable registry factory.
	match := CommonFactory{ZoneNames: slices.Clone(f.ZoneNames), MapIDs: slices.Clone(f.MapIDs), InstanceTypes: slices.Clone(f.InstanceTypes)}
	h := &HookableGraphRecipe{EncounterVariant: f.GraphEncounterVariant, Preprocessors: slices.Clone(f.GraphPreprocessors), ID: f.GraphID, Format: format, Flavor: slices.Clone(flavor), Factories: factories, Name: f.Name, Category: f.Category, MatchesZone: match.MatchZone}
	if f.GraphEncounterVariant != nil {
		variant := *f.GraphEncounterVariant
		h.EncounterVariant = &variant
	}
	if f.FlavoredRankings != nil {
		h.Rankings = f.FlavoredRankings(flavor)
	}
	if f.DerivedName != nil {
		if derived := f.DerivedName(flavor); derived != nil {
			h.DerivedNames = make(map[string][]uint32)
			for entry, name := range derived.config {
				h.DerivedNames[name] = append(h.DerivedNames[name], entry)
			}
			for _, entries := range h.DerivedNames {
				slices.Sort(entries)
			}
		}
	}
	if f.DerivedRankings != nil {
		h.DerivedRankings = make(map[string]*rankings.Rankings, len(f.DerivedRankings))
		for name, factory := range f.DerivedRankings {
			if factory == nil {
				return nil, fmt.Errorf("nil derived ranking factory %s", name)
			}
			h.DerivedRankings[name] = factory(flavor)
		}
	}
	// Hostile rules include trusted encounter-name callbacks. Prepare their
	// configuration once; new identifiers detach maps from this static definition.
	static := f.Hostiles(flavor)
	if static == nil {
		return nil, fmt.Errorf("nil hostile rules for %s", f.GraphID)
	}
	entries := maps.Clone(static.HostileEntries())
	id := identifier.TrustedRecipe{ID: f.GraphID, Factory: func() *identifier.Identifier { return identifier.NewIdentifier(entries) }}
	p := &PreparedCommonGraph{Hook: h, Identifier: id}
	if len(match.MapIDs) == 1 {
		p.defaultMapID = match.MapIDs[0]
	}

	if f.GraphZoneName == ZoneNameRecipeOnyxiaProgression && format == database.LogFormat335aCcAddon && flavor.Has(database.FlavorAzerothcoreProgression) {
		classic := func(z zone.Zone) bool { return z.InstanceType == "raid" && z.DifficultyName == "" && z.MaxPlayers == 0 }
		h.MatchesZone = func(z zone.Zone) bool { return match.MatchZone(z) && !classic(z) }
		other := *h
		other.ID += "/classic"
		other.Name = "Onyxia Classic"
		other.MatchesZone = func(z zone.Zone) bool { return match.MatchZone(z) && classic(z) }
		otherID := id
		otherID.ID = other.ID
		p.Variants = []*PreparedCommonGraph{{Hook: &other, Identifier: otherID, defaultMapID: p.defaultMapID}}
	}
	return p, nil
}

// ZoneNameRecipe admits only named executable policies, never arbitrary archive callbacks.
type ZoneNameRecipe string

const ZoneNameRecipeOnyxiaProgression ZoneNameRecipe = "onyxia-progression/v1"

func (p *PreparedCommonGraph) New(ctx context.Context, logger *slog.Logger, units *unitdb.Units, z zone.Zone) (*Hookable, error) {
	for _, variant := range p.Variants {
		if variant.Hook.MatchesZone(z) {
			return variant.New(ctx, logger, units, z)
		}
	}
	if z.MapID == 0 {
		z.MapID = p.defaultMapID
	}
	var id *identifier.Identifier
	var err error
	if p.Hook.Format == database.LogFormatAzerothcoreMod {
		id, err = p.Identifier.NewServerClassification()
	} else {
		id, err = p.Identifier.New()
	}
	if err != nil {
		return nil, err
	}
	return p.Hook.New(ctx, logger, units, z, id)
}
