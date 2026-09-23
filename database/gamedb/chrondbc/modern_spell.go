package chrondbc

import (
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/google/uuid"
)

// SpellEffect is one canonical spell effect. It contains the union of fields
// used by legacy Spell.dbc rows and normalized modern SpellEffect rows.
type SpellEffect struct {
	DatasetID    uuid.UUID `json:"dataset_id,omitempty"`
	SpellID      SpellID   `json:"spell_id,omitempty"`
	DifficultyID int32     `json:"difficulty_id,omitempty"`
	EffectIndex  int32     `json:"effect_index"`
	SourceID     int32     `json:"source_id,omitempty"`

	Effect                   Effect             `json:"effect"`
	EffectDieSides           int32              `json:"effect_die_sides,omitempty"`
	EffectRealPointsPerLevel float32            `json:"effect_real_points_per_level,omitempty"`
	EffectBasePoints         int32              `json:"effect_base_points"`
	EffectBasePointsF        *float32           `json:"effect_base_points_f,omitempty"`
	EffectMechanic           int32              `json:"effect_mechanic,omitempty"`
	EffectRadius             dbcmem.SpellRadius `json:"effect_radius"`
	EffectRadiusIndex        []int32            `json:"effect_radius_index,omitempty"`
	EffectAura               AuraEffect         `json:"effect_aura,omitempty"`
	EffectAuraPeriod         int32              `json:"effect_aura_period,omitempty"`
	EffectAmplitude          float32            `json:"effect_amplitude,omitempty"`
	EffectChainTargets       int32              `json:"effect_chain_targets,omitempty"`
	EffectItemType           ItemID             `json:"effect_item_type,omitempty"`
	EffectMiscValue          []int32            `json:"effect_misc_value,omitempty"`
	EffectTriggerSpell       SpellID            `json:"effect_trigger_spell,omitempty"`
	EffectPointsPerCombo     float32            `json:"effect_points_per_combo,omitempty"`
	EffectBaseDice           int32              `json:"effect_base_dice,omitempty"`
	EffectDicePerLevel       int32              `json:"effect_dice_per_level,omitempty"`
	EffectChainAmplitude     float32            `json:"effect_chain_amplitude,omitempty"`
	ImplicitTarget           []int32            `json:"implicit_target,omitempty"`

	BonusCoefficientFromAP         float32 `json:"bonus_coefficient_from_ap,omitempty"`
	Coefficient                    float32 `json:"coefficient,omitempty"`
	EffectAttributes               int32   `json:"effect_attributes,omitempty"`
	EffectBonusCoefficient         float32 `json:"effect_bonus_coefficient,omitempty"`
	EffectPointsPerResource        float32 `json:"effect_points_per_resource,omitempty"`
	EffectPosFacing                float32 `json:"effect_pos_facing,omitempty"`
	EffectSpellClassMask           []int32 `json:"effect_spell_class_mask,omitempty"`
	GroupSizeBasePointsCoefficient float32 `json:"group_size_base_points_coefficient,omitempty"`
	NodeField120063534001          int32   `json:"node_field_12_0_0_63534_001,omitempty"`
	PVPMultiplier                  float32 `json:"pvp_multiplier,omitempty"`
	ResourceCoefficient            float32 `json:"resource_coefficient,omitempty"`
	ScalingClass                   int32   `json:"scaling_class,omitempty"`
	Variance                       float32 `json:"variance,omitempty"`
}

// EffectiveBasePoints returns the actual base points. Legacy Spell.dbc stores
// the value minus one, while modern DB2 rows store the exact float value.
func (e SpellEffect) EffectiveBasePoints() float32 {
	if e.EffectBasePointsF != nil {
		return *e.EffectBasePointsF
	}
	return float32(e.EffectBasePoints + 1)
}

// DamageTakenSchoolMask returns the legacy scalar school mask used by
// AuraEffectModDamagePercentTaken. Modern rows preserve every source value, but
// this compatibility consumer has always classified against one mask.
func (e SpellEffect) DamageTakenSchoolMask() (School, bool) {
	if len(e.EffectMiscValue) == 0 {
		return 0, false
	}
	return School(e.EffectMiscValue[0]), true
}

// ModernSpellEffect is kept as a source-compatible alias for callers that
// still use the old normalized-row name.
// Deprecated: use SpellEffect.
type ModernSpellEffect = SpellEffect

// SpellPower is one canonical resource-cost row for a spell. Legacy Spell.dbc
// data produces one row, while modern DB2 data can produce multiple ordered rows.
type SpellPower struct {
	DatasetID           uuid.UUID `json:"dataset_id"`
	SpellID             SpellID   `json:"spell_id"`
	OrderIndex          int32     `json:"order_index"`
	SourceID            int32     `json:"source_id"`
	AltPowerBarID       int32     `json:"alt_power_bar_id"`
	ManaCost            int32     `json:"mana_cost"`
	ManaCostPerLevel    int32     `json:"mana_cost_per_level"`
	ManaPerSecond       int32     `json:"mana_per_second"`
	OptionalCost        int32     `json:"optional_cost"`
	OptionalCostPct     float32   `json:"optional_cost_pct"`
	PowerCostMaxPct     float32   `json:"power_cost_max_pct"`
	PowerCostPct        float32   `json:"power_cost_pct"`
	PowerDisplayID      int32     `json:"power_display_id"`
	PowerPctPerSecond   float32   `json:"power_pct_per_second"`
	PowerType           int32     `json:"power_type"`
	RequiredAuraSpellID int32     `json:"required_aura_spell_id"`
}

// ModernSpellPower is kept as a source-compatible alias for callers that use
// the old normalized-row name.
// Deprecated: use SpellPower.
type ModernSpellPower = SpellPower

// SpellVariant contains the optional normalized components for one spell difficulty.
type SpellVariant struct {
	DatasetID          uuid.UUID                      `json:"dataset_id"`
	SpellID            SpellID                        `json:"spell_id"`
	DifficultyID       int32                          `json:"difficulty_id"`
	Misc               *ModernSpellMisc               `json:"misc,omitempty"`
	AuraOptions        *ModernSpellAuraOptions        `json:"aura_options,omitempty"`
	AuraRestrictions   *ModernSpellAuraRestrictions   `json:"aura_restrictions,omitempty"`
	ClassOptions       *ModernSpellClassOptions       `json:"class_options,omitempty"`
	Interrupts         *ModernSpellInterrupts         `json:"interrupts,omitempty"`
	Categories         *ModernSpellCategories         `json:"categories,omitempty"`
	Cooldowns          *ModernSpellCooldowns          `json:"cooldowns,omitempty"`
	Levels             *ModernSpellLevels             `json:"levels,omitempty"`
	TargetRestrictions *ModernSpellTargetRestrictions `json:"target_restrictions,omitempty"`
}

// ModernSpellVariant is kept as a source-compatible alias for callers that use
// the old normalized-row name.
// Deprecated: use SpellVariant.
type ModernSpellVariant = SpellVariant

type ModernSpellMisc struct {
	ID                               int32   `json:"id"`
	ActiveIconFileDataID             int32   `json:"active_icon_file_data_id"`
	ActiveSpellVisualScript          int32   `json:"active_spell_visual_script"`
	Attributes                       []int32 `json:"attributes"`
	CastingTimeIndex                 int32   `json:"casting_time_index"`
	ContentTuningID                  int32   `json:"content_tuning_id"`
	DurationIndex                    int32   `json:"duration_index"`
	LaunchDelay                      float32 `json:"launch_delay"`
	MinDuration                      float32 `json:"min_duration"`
	PVPDurationIndex                 int32   `json:"pvp_duration_index"`
	RangeIndex                       int32   `json:"range_index"`
	SchoolMask                       int32   `json:"school_mask"`
	ShowFutureSpellPlayerConditionID int32   `json:"show_future_spell_player_condition_id"`
	Speed                            float32 `json:"speed"`
	SpellIconFileDataID              int32   `json:"spell_icon_file_data_id"`
	SpellVisualScript                int32   `json:"spell_visual_script"`
}

type ModernSpellAuraOptions struct {
	ID                    int32   `json:"id"`
	CumulativeAura        int32   `json:"cumulative_aura"`
	ProcCategoryRecovery  int32   `json:"proc_category_recovery"`
	ProcChance            int32   `json:"proc_chance"`
	ProcCharges           int32   `json:"proc_charges"`
	ProcTypeMask          []int32 `json:"proc_type_mask"`
	SpellProcsPerMinuteID int32   `json:"spell_procs_per_minute_id"`
}

type ModernSpellAuraRestrictions struct {
	ID                     int32 `json:"id"`
	CasterAuraSpell        int32 `json:"caster_aura_spell"`
	CasterAuraState        int32 `json:"caster_aura_state"`
	CasterAuraType         int32 `json:"caster_aura_type"`
	ExcludeCasterAuraSpell int32 `json:"exclude_caster_aura_spell"`
	ExcludeCasterAuraState int32 `json:"exclude_caster_aura_state"`
	ExcludeCasterAuraType  int32 `json:"exclude_caster_aura_type"`
	ExcludeTargetAuraSpell int32 `json:"exclude_target_aura_spell"`
	ExcludeTargetAuraState int32 `json:"exclude_target_aura_state"`
	ExcludeTargetAuraType  int32 `json:"exclude_target_aura_type"`
	TargetAuraSpell        int32 `json:"target_aura_spell"`
	TargetAuraState        int32 `json:"target_aura_state"`
	TargetAuraType         int32 `json:"target_aura_type"`
}

type ModernSpellClassOptions struct {
	ID             int32   `json:"id"`
	ModalNextSpell int32   `json:"modal_next_spell"`
	SpellClassSet  int32   `json:"spell_class_set"`
	SpellClassMask []int32 `json:"spell_class_mask"`
}

type ModernSpellInterrupts struct {
	ID                    int32   `json:"id"`
	AuraInterruptFlags    []int32 `json:"aura_interrupt_flags"`
	ChannelInterruptFlags []int32 `json:"channel_interrupt_flags"`
	InterruptFlags        int32   `json:"interrupt_flags"`
}

type ModernSpellCategories struct {
	ID                    int32 `json:"id"`
	Category              int32 `json:"category"`
	ChargeCategory        int32 `json:"charge_category"`
	DefenseType           int32 `json:"defense_type"`
	DiminishType          int32 `json:"diminish_type"`
	DispelType            int32 `json:"dispel_type"`
	Mechanic              int32 `json:"mechanic"`
	PreventionType        int32 `json:"prevention_type"`
	StartRecoveryCategory int32 `json:"start_recovery_category"`
}

type ModernSpellCooldowns struct {
	ID                   int32 `json:"id"`
	AuraSpellID          int32 `json:"aura_spell_id"`
	CategoryRecoveryTime int32 `json:"category_recovery_time"`
	RecoveryTime         int32 `json:"recovery_time"`
	StartRecoveryTime    int32 `json:"start_recovery_time"`
}

type ModernSpellLevels struct {
	ID                  int32 `json:"id"`
	BaseLevel           int32 `json:"base_level"`
	MaxLevel            int32 `json:"max_level"`
	MaxPassiveAuraLevel int32 `json:"max_passive_aura_level"`
	SpellLevel          int32 `json:"spell_level"`
}

type ModernSpellTargetRestrictions struct {
	ID                 int32   `json:"id"`
	ConeDegrees        float32 `json:"cone_degrees"`
	MaxTargetLevel     int32   `json:"max_target_level"`
	MaxTargets         int32   `json:"max_targets"`
	TargetCreatureType int32   `json:"target_creature_type"`
	Targets            int32   `json:"targets"`
	Width              float32 `json:"width"`
}
