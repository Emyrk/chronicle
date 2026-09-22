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
	SpellEffects              []SpellEffect                `json:"spellEffects"`
	SpellPowers               []SpellPower                 `json:"spellPowers"`
	SpellVariants             []SpellVariant               `json:"spellVariants"`
	Losses                    LossReport                   `json:"losses"`
}

type SpellEffect struct {
	SourceID, SpellID, DifficultyID, EffectIndex               int32
	BonusCoefficientFromAP, Coefficient                        float32
	Effect, EffectAttributes, EffectAura, EffectAuraPeriod     int32
	EffectAmplitude, EffectBasePointsF, EffectBonusCoefficient float32
	EffectChainAmplitude                                       float32
	EffectChainTargets, EffectItemType, EffectMechanic         int32
	EffectMiscValue                                            []int32
	EffectPointsPerResource, EffectPosFacing                   float32
	EffectRadiusIndex, EffectSpellClassMask                    []int32
	EffectRealPointsPerLevel                                   float32
	EffectTriggerSpell                                         int32
	GroupSizeBasePointsCoefficient                             float32
	NodeField120063534001                                      int32
	PvpMultiplier, ResourceCoefficient                         float32
	ScalingClass                                               int32
	ImplicitTarget                                             []int32
	Variance                                                   float32
}

type SpellPower struct {
	SourceID, SpellID, OrderIndex                            int32
	AltPowerBarID, ManaCost, ManaCostPerLevel, ManaPerSecond int32
	OptionalCost                                             int32
	OptionalCostPct, PowerCostMaxPct, PowerCostPct           float32
	PowerDisplayID                                           int32
	PowerPctPerSecond                                        float32
	PowerType, RequiredAuraSpellID                           int32
}

type SpellVariant struct {
	SpellID, DifficultyID int32
	Misc                  *SpellMisc
	AuraOptions           *SpellAuraOptions
	AuraRestrictions      *SpellAuraRestrictions
	ClassOptions          *SpellClassOptions
	Interrupts            *SpellInterrupts
	Categories            *SpellCategories
	Cooldowns             *SpellCooldowns
	Levels                *SpellLevels
	TargetRestrictions    *SpellTargetRestrictions
}

type SpellMisc struct {
	SourceID                                         int32
	ActiveIconFileDataID, ActiveSpellVisualScript    int32
	Attributes                                       []int32
	CastingTimeIndex, ContentTuningID, DurationIndex int32
	LaunchDelay, MinDuration                         float32
	PvPDurationIndex, RangeIndex, SchoolMask         int32
	ShowFutureSpellPlayerConditionID                 int32
	Speed                                            float32
	SpellIconFileDataID, SpellVisualScript           int32
}

type SpellAuraOptions struct {
	SourceID, CumulativeAura, ProcCategoryRecovery, ProcChance int32
	ProcCharges                                                int32
	ProcTypeMask                                               []int32
	SpellProcsPerMinuteID                                      int32
}

type SpellAuraRestrictions struct {
	SourceID, CasterAuraSpell, CasterAuraState, CasterAuraType int32
	ExcludeCasterAuraSpell, ExcludeCasterAuraState             int32
	ExcludeCasterAuraType                                      int32
	ExcludeTargetAuraSpell, ExcludeTargetAuraState             int32
	ExcludeTargetAuraType                                      int32
	TargetAuraSpell, TargetAuraState, TargetAuraType           int32
}

type SpellClassOptions struct {
	SourceID, ModalNextSpell, SpellClassSet int32
	SpellClassMask                          []int32
}

type SpellInterrupts struct {
	SourceID, InterruptFlags                  int32
	AuraInterruptFlags, ChannelInterruptFlags []int32
}

type SpellCategories struct {
	SourceID, Category, ChargeCategory, DefenseType, DiminishType int32
	DispelType, Mechanic, PreventionType, StartRecoveryCategory   int32
}

type SpellCooldowns struct {
	SourceID, AuraSpellID                                 int32
	CategoryRecoveryTime, RecoveryTime, StartRecoveryTime int32
}

type SpellLevels struct {
	SourceID, BaseLevel, MaxLevel, MaxPassiveAuraLevel, SpellLevel int32
}

type SpellTargetRestrictions struct {
	SourceID, MaxTargetLevel, MaxTargets, TargetCreatureType, Targets int32
	ConeDegrees, Width                                                float32
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
