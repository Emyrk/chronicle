// Package wowdata converts Chronicle wowdata snapshots into dataset import rows.
package wowdata

import (
	"encoding/json"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spelldb"
)

const SnapshotFormat = "chronicle-wowdata-snapshot-v1"

type Manifest struct {
	Format   string          `json:"format"`
	RowLimit int             `json:"rowLimit"`
	Target   Target          `json:"target"`
	Tables   []ManifestTable `json:"tables"`
	Icons    *ManifestIcons  `json:"icons,omitempty"`
}

type ManifestIcons struct {
	Rows  string `json:"rows"`
	Count int    `json:"count"`
}

type Target struct {
	Region    string `json:"region"`
	Product   string `json:"product"`
	BuildName string `json:"buildName"`
	Locale    string `json:"locale"`
}

type ManifestTable struct {
	Name          string `json:"name"`
	Rows          string `json:"rows"`
	ExtractedRows int    `json:"extractedRows"`
}

type Import struct {
	Format                    string                       `json:"format"`
	Product                   string                       `json:"product"`
	Build                     string                       `json:"build"`
	Spells                    []spelldb.SpellRow           `json:"spells"`
	SpellIcons                []SpellIcon                  `json:"spellIcons"`
	Items                     []database.WorldItemTemplate `json:"items"`
	TalentTrees               json.RawMessage              `json:"talentTrees"`
	SpellCastTimes            []SpellCastTime              `json:"spellCastTimes"`
	SpellDurations            []SpellDuration              `json:"spellDurations"`
	SpellRanges               []SpellRange                 `json:"spellRanges"`
	SpellCategories           []SpellCategory              `json:"spellCategories"`
	SpellRadii                []SpellRadius                `json:"spellRadii"`
	SpellFocusObjects         []SpellFocusObject           `json:"spellFocusObjects"`
	SpellDescriptionVariables []SpellDescriptionVariables  `json:"spellDescriptionVariables"`
	Enchantments              []Enchantment                `json:"enchantments"`
	ItemSets                  []ItemSet                    `json:"itemSets"`
	Losses                    LossReport                   `json:"losses"`
}

type LossReport struct {
	MissingItemSparseCount int      `json:"missingItemSparseCount,omitempty"`
	MissingItemSparseIDs   []int32  `json:"missingItemSparseIds,omitempty"`
	MissingItemBaseCount   int      `json:"missingItemBaseCount,omitempty"`
	MissingItemBaseIDs     []int32  `json:"missingItemBaseIds,omitempty"`
	DroppedSpellEffects    int      `json:"droppedSpellEffects,omitempty"`
	DroppedSpellPowers     int      `json:"droppedSpellPowers,omitempty"`
	DroppedSpellAttributes int      `json:"droppedSpellAttributes,omitempty"`
	RoundedBasePoints      int      `json:"roundedBasePoints,omitempty"`
	DroppedOrphanSpellRows int      `json:"droppedOrphanSpellRows,omitempty"`
	Policies               []string `json:"policies"`
}

type SpellIcon struct {
	ID              int32  `json:"id"`
	TextureFilename string `json:"textureFilename"`
}

type SpellCastTime struct{ ID, Base, Minimum int32 }
type SpellDuration struct{ ID, Duration, MaxDuration int32 }
type SpellRange struct {
	ID                 int32
	RangeMin, RangeMax float32
	Flags              int32
	Name               string
}
type SpellCategory struct {
	ID, Flags, UsesPerWeek                   int32
	Name                                     string
	MaxCharges, ChargeRecoveryTime, TypeMask int32
}
type SpellRadius struct {
	ID                                           int32
	Radius, RadiusPerLevel, RadiusMin, RadiusMax float32
}
type SpellFocusObject struct {
	ID   int32
	Name string
}
type SpellDescriptionVariables struct {
	ID        int32
	Variables string
}
type Enchantment struct {
	ID, Charges                                                               int32
	Effect                                                                    [3]int32
	EffectPointsMin                                                           [3]int32
	EffectArg                                                                 [3]int32
	Name                                                                      string
	ItemVisual, Flags, RequiredSkillID, RequiredSkillRank, MinLevel, MaxLevel int32
}
type ItemSet struct {
	ID                               int32
	Name                             string
	RequiredSkill, RequiredSkillRank int32
	ItemIDs                          []int32
}
