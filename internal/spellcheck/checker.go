// Package spellcheck validates database-backed spells through the production
// fetch and JSON response paths without modifying the dataset.
package spellcheck

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/services/servicewowdb"
	"github.com/google/uuid"
)

// Report summarizes the rows and modern shapes observed in one dataset.
type Report struct {
	DatasetID             uuid.UUID
	Spells                int
	NormalizedEffects     int
	NormalizedPowers      int
	NormalizedVariants    int
	SparseEffectSets      int
	RepeatedEffectIndexes int
	EffectsBeyondIndexTwo int
	NondefaultEffects     int
	NondefaultVariants    int
	ExactFloatEffects     int
	FractionalEffects     int
	ComponentOnlySpellIDs int
	ComponentOnlyEffects  int
	ComponentOnlyPowers   int
	ComponentOnlyVariants int
}

type effectKey struct {
	DifficultyID int32
	EffectIndex  int32
	SourceID     int32
}

type powerKey struct {
	OrderIndex int32
	SourceID   int32
}

type sourceEffect struct {
	key        effectKey
	basePoints float32
}

type sourceSpell struct {
	effects  []sourceEffect
	powers   []powerKey
	variants []int32
}

type jsonSpell struct {
	ID             int32         `json:"id"`
	Effects        []jsonEffect  `json:"effects"`
	ModernEffects  []jsonEffect  `json:"modern_effects"`
	Powers         []jsonPower   `json:"powers"`
	ModernPowers   []jsonPower   `json:"modern_powers"`
	Variants       []jsonVariant `json:"variants"`
	ModernVariants []jsonVariant `json:"modern_variants"`
}

type jsonEffect struct {
	DatasetID        uuid.UUID `json:"dataset_id"`
	SpellID          int32     `json:"spell_id"`
	DifficultyID     int32     `json:"difficulty_id"`
	EffectIndex      int32     `json:"effect_index"`
	SourceID         int32     `json:"source_id"`
	EffectBasePoints *float32  `json:"effect_base_points_f"`
}

type jsonPower struct {
	DatasetID  uuid.UUID `json:"dataset_id"`
	SpellID    int32     `json:"spell_id"`
	OrderIndex int32     `json:"order_index"`
	SourceID   int32     `json:"source_id"`
}

type jsonVariant struct {
	DatasetID    uuid.UUID `json:"dataset_id"`
	SpellID      int32     `json:"spell_id"`
	DifficultyID int32     `json:"difficulty_id"`
}

// DatasetSpellFetcher is the production dataset-aware spell lookup contract.
type DatasetSpellFetcher interface {
	Spell(context.Context, uuid.UUID, chrondbc.SpellID) (*chrondbc.Spell, error)
}

// CheckDataset loads every dbc_spells row through the production GameDB fetch
// path, marshals the production WoWDB response, and verifies that normalized
// component rows remain lossless in both representations.
func CheckDataset(ctx context.Context, store database.Store, datasetID uuid.UUID, fetcher DatasetSpellFetcher) (Report, error) {
	sources, ids, report, err := loadSourceRows(ctx, store, datasetID)
	if err != nil {
		return Report{}, err
	}

	for _, id := range ids {
		spell, err := fetcher.Spell(ctx, datasetID, chrondbc.SpellID(id))
		if err != nil {
			return Report{}, fmt.Errorf("dataset %s spell %d production fetch: %w", datasetID, id, err)
		}
		if spell.ID != chrondbc.SpellID(id) {
			return Report{}, fmt.Errorf("dataset %s spell %d production fetch returned spell %d", datasetID, id, spell.ID)
		}

		encoded, err := json.Marshal(servicewowdb.NewSpellResponse(spell))
		if err != nil {
			return Report{}, fmt.Errorf("dataset %s spell %d production JSON: %w", datasetID, id, err)
		}
		var payload jsonSpell
		if err := json.Unmarshal(encoded, &payload); err != nil {
			return Report{}, fmt.Errorf("dataset %s spell %d decode production JSON: %w", datasetID, id, err)
		}
		if payload.ID != id {
			return Report{}, fmt.Errorf("dataset %s spell %d JSON returned spell %d", datasetID, id, payload.ID)
		}
		if err := checkSpell(datasetID, id, sources[id], spell, payload); err != nil {
			return Report{}, err
		}
	}

	report.Spells = len(ids)
	return report, nil
}

func checkSpell(datasetID uuid.UUID, spellID int32, source sourceSpell, spell *chrondbc.Spell, payload jsonSpell) error {
	if len(payload.Effects) != len(spell.Effects) {
		return fmt.Errorf("dataset %s spell %d canonical effects JSON: fetched=%d json=%d", datasetID, spellID, len(spell.Effects), len(payload.Effects))
	}
	for i, effect := range spell.Effects {
		if payload.Effects[i].EffectIndex != effect.EffectIndex || payload.Effects[i].DifficultyID != effect.DifficultyID || payload.Effects[i].SourceID != effect.SourceID {
			return fmt.Errorf("dataset %s spell %d canonical effect %d changed in JSON", datasetID, spellID, i)
		}
	}
	if len(payload.Powers) != len(spell.Powers) {
		return fmt.Errorf("dataset %s spell %d canonical powers JSON: fetched=%d json=%d", datasetID, spellID, len(spell.Powers), len(payload.Powers))
	}
	if len(payload.Variants) != len(spell.Variants) {
		return fmt.Errorf("dataset %s spell %d canonical variants JSON: fetched=%d json=%d", datasetID, spellID, len(spell.Variants), len(payload.Variants))
	}

	if len(source.effects) > 0 {
		if len(spell.Effects) != len(source.effects) {
			return fmt.Errorf("dataset %s spell %d effects: database=%d fetched=%d", datasetID, spellID, len(source.effects), len(spell.Effects))
		}
		if len(payload.Effects) != len(source.effects) || len(payload.ModernEffects) != len(source.effects) {
			return fmt.Errorf("dataset %s spell %d effects JSON: database=%d canonical=%d modern=%d", datasetID, spellID, len(source.effects), len(payload.Effects), len(payload.ModernEffects))
		}
		if err := compareEffects(datasetID, spellID, source.effects, spell.Effects, payload.Effects, payload.ModernEffects); err != nil {
			return err
		}
	} else if len(payload.ModernEffects) != 0 {
		return fmt.Errorf("dataset %s spell %d emitted %d modern effects without normalized rows", datasetID, spellID, len(payload.ModernEffects))
	}

	if len(source.powers) > 0 {
		if len(spell.Powers) != len(source.powers) || len(payload.Powers) != len(source.powers) || len(payload.ModernPowers) != len(source.powers) {
			return fmt.Errorf("dataset %s spell %d powers: database=%d fetched=%d canonical_json=%d modern_json=%d", datasetID, spellID, len(source.powers), len(spell.Powers), len(payload.Powers), len(payload.ModernPowers))
		}
		for i, expected := range source.powers {
			actual := spell.Powers[i]
			if actual.DatasetID != datasetID || int32(actual.SpellID) != spellID || actual.OrderIndex != expected.OrderIndex || actual.SourceID != expected.SourceID {
				return fmt.Errorf("dataset %s spell %d power %d changed identity", datasetID, spellID, i)
			}
			if !jsonPowerMatches(payload.Powers[i], datasetID, spellID, expected) || !jsonPowerMatches(payload.ModernPowers[i], datasetID, spellID, expected) {
				return fmt.Errorf("dataset %s spell %d power %d changed in JSON", datasetID, spellID, i)
			}
		}
	} else if len(payload.ModernPowers) != 0 {
		return fmt.Errorf("dataset %s spell %d emitted %d modern powers without normalized rows", datasetID, spellID, len(payload.ModernPowers))
	}

	if len(spell.Variants) != len(source.variants) || len(payload.Variants) != len(source.variants) || len(payload.ModernVariants) != len(source.variants) {
		return fmt.Errorf("dataset %s spell %d variants: database=%d fetched=%d canonical_json=%d modern_json=%d", datasetID, spellID, len(source.variants), len(spell.Variants), len(payload.Variants), len(payload.ModernVariants))
	}
	for i, difficultyID := range source.variants {
		actual := spell.Variants[i]
		if actual.DatasetID != datasetID || int32(actual.SpellID) != spellID || actual.DifficultyID != difficultyID {
			return fmt.Errorf("dataset %s spell %d variant %d changed identity", datasetID, spellID, i)
		}
		if !jsonVariantMatches(payload.Variants[i], datasetID, spellID, difficultyID) || !jsonVariantMatches(payload.ModernVariants[i], datasetID, spellID, difficultyID) {
			return fmt.Errorf("dataset %s spell %d variant %d changed in JSON", datasetID, spellID, i)
		}
	}
	return nil
}

func compareEffects(datasetID uuid.UUID, spellID int32, expected []sourceEffect, fetched []chrondbc.SpellEffect, canonicalJSON, modernJSON []jsonEffect) error {
	for i, source := range expected {
		actual := fetched[i]
		if actual.DatasetID != datasetID || int32(actual.SpellID) != spellID || actual.DifficultyID != source.key.DifficultyID || actual.EffectIndex != source.key.EffectIndex || actual.SourceID != source.key.SourceID {
			return fmt.Errorf("dataset %s spell %d effect %d changed identity", datasetID, spellID, i)
		}
		if actual.EffectBasePointsF == nil || math.Float32bits(*actual.EffectBasePointsF) != math.Float32bits(source.basePoints) {
			return fmt.Errorf("dataset %s spell %d effect %d exact base points changed: database=%v fetched=%v", datasetID, spellID, i, source.basePoints, actual.EffectBasePointsF)
		}
		if !jsonEffectMatches(canonicalJSON[i], datasetID, spellID, source) || !jsonEffectMatches(modernJSON[i], datasetID, spellID, source) {
			return fmt.Errorf("dataset %s spell %d effect %d changed in JSON", datasetID, spellID, i)
		}
	}
	return nil
}

func jsonEffectMatches(actual jsonEffect, datasetID uuid.UUID, spellID int32, expected sourceEffect) bool {
	return actual.DatasetID == datasetID && actual.SpellID == spellID &&
		actual.DifficultyID == expected.key.DifficultyID && actual.EffectIndex == expected.key.EffectIndex && actual.SourceID == expected.key.SourceID &&
		actual.EffectBasePoints != nil && math.Float32bits(*actual.EffectBasePoints) == math.Float32bits(expected.basePoints)
}

func jsonPowerMatches(actual jsonPower, datasetID uuid.UUID, spellID int32, expected powerKey) bool {
	return actual.DatasetID == datasetID && actual.SpellID == spellID && actual.OrderIndex == expected.OrderIndex && actual.SourceID == expected.SourceID
}

func jsonVariantMatches(actual jsonVariant, datasetID uuid.UUID, spellID, difficultyID int32) bool {
	return actual.DatasetID == datasetID && actual.SpellID == spellID && actual.DifficultyID == difficultyID
}

func loadSourceRows(ctx context.Context, store database.Store, datasetID uuid.UUID) (map[int32]sourceSpell, []int32, Report, error) {
	sources := make(map[int32]sourceSpell)
	report := Report{DatasetID: datasetID}

	ids, err := store.ListSpellIDsForCheck(ctx, datasetID)
	if err != nil {
		return nil, nil, Report{}, fmt.Errorf("list dataset %s spells: %w", datasetID, err)
	}

	effectRows, err := store.ListSpellEffectsForCheck(ctx, datasetID)
	if err != nil {
		return nil, nil, Report{}, fmt.Errorf("list dataset %s effects: %w", datasetID, err)
	}
	indexes := make(map[[2]int32][]int32)
	for _, row := range effectRows {
		source := sources[row.SpellID]
		source.effects = append(source.effects, sourceEffect{key: effectKey{row.DifficultyID, row.EffectIndex, row.SourceID}, basePoints: row.EffectBasePointsF})
		sources[row.SpellID] = source
		report.NormalizedEffects++
		report.ExactFloatEffects++
		if row.EffectBasePointsF != float32(int32(row.EffectBasePointsF)) {
			report.FractionalEffects++
		}
		if row.EffectIndex > 2 {
			report.EffectsBeyondIndexTwo++
		}
		if row.DifficultyID != 0 {
			report.NondefaultEffects++
		}
		key := [2]int32{row.SpellID, row.DifficultyID}
		indexes[key] = append(indexes[key], row.EffectIndex)
	}
	for _, values := range indexes {
		unique := make(map[int32]int)
		for _, index := range values {
			unique[index]++
			if unique[index] > 1 {
				report.RepeatedEffectIndexes++
			}
		}
		ordered := make([]int, 0, len(unique))
		for index := range unique {
			ordered = append(ordered, int(index))
		}
		sort.Ints(ordered)
		for i, index := range ordered {
			if index != i {
				report.SparseEffectSets++
				break
			}
		}
	}

	powerRows, err := store.ListSpellPowersForCheck(ctx, datasetID)
	if err != nil {
		return nil, nil, Report{}, fmt.Errorf("list dataset %s powers: %w", datasetID, err)
	}
	for _, row := range powerRows {
		source := sources[row.SpellID]
		source.powers = append(source.powers, powerKey{row.OrderIndex, row.SourceID})
		sources[row.SpellID] = source
		report.NormalizedPowers++
	}

	variantRows, err := store.ListSpellVariantsForCheck(ctx, datasetID)
	if err != nil {
		return nil, nil, Report{}, fmt.Errorf("list dataset %s variants: %w", datasetID, err)
	}
	for _, row := range variantRows {
		source := sources[row.SpellID]
		source.variants = append(source.variants, row.DifficultyID)
		sources[row.SpellID] = source
		report.NormalizedVariants++
		if row.DifficultyID != 0 {
			report.NondefaultVariants++
		}
	}

	idSet := make(map[int32]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	for spellID, source := range sources {
		if _, ok := idSet[spellID]; ok {
			continue
		}
		report.ComponentOnlySpellIDs++
		report.ComponentOnlyEffects += len(source.effects)
		report.ComponentOnlyPowers += len(source.powers)
		report.ComponentOnlyVariants += len(source.variants)
	}
	return sources, ids, report, nil
}
