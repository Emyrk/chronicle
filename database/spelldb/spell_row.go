// Package spelldb provides a database-backed spell type that mirrors the
// dbc_spells table. SpellRow implements pgx row scanning via db struct tags
// and converts to/from chrondbc.Spell for use in the parser and API.
package spelldb

import (
	"time"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/internal/bitmask"
	"github.com/Gophercraft/core/i18n"
	"github.com/google/uuid"
)

func derefOr(p *int32) int32 {
	if p != nil {
		return *p
	}
	return 0
}

func derefOrF(p *float32) float32 {
	if p != nil {
		return *p
	}
	return 0
}

func derefOrS(p *string) string {
	if p != nil {
		return *p
	}
	return ""
}

// SpellRow is the database representation of a spell, mapping 1:1 to the
// dbc_spells table. All custom types are flattened to primitive Go types so
// pgx can scan them directly. Use ToSpell/FromSpell for conversion.
type SpellRow struct {
	DatasetID uuid.UUID `db:"dataset_id"`
	SpellID   int32     `db:"spell_id"`

	// Core Identification
	Name            string `db:"name"`
	NameSubtext     string `db:"name_subtext"`
	Description     string `db:"description"`
	AuraDescription string `db:"aura_description"`

	// Display
	SpellIconID  int32 `db:"spell_icon_id"`
	ActiveIconID int32 `db:"active_icon_id"`

	// Level Requirements
	MaxLevel       int32 `db:"max_level"`
	BaseLevel      int32 `db:"base_level"`
	SpellLevel     int32 `db:"spell_level"`
	Category       int32 `db:"category"`
	MaxTargetLevel int32 `db:"max_target_level"`

	// Behavior
	School             int32   `db:"school"`
	SpellPriority      int32   `db:"spell_priority"`
	StanceBarOrder     int32   `db:"stance_bar_order"`
	ProcTypeMask       int32   `db:"proc_type_mask"`
	ProcFlags          int32   `db:"proc_flags"`
	ProcChance         int32   `db:"proc_chance"`
	ProcCharges        int32   `db:"proc_charges"`
	Speed              float32 `db:"speed"`
	DispelType         int32   `db:"dispel_type"`
	AuraInterruptFlags int32   `db:"aura_interrupt_flags"`
	ModalNextSpell     int32   `db:"modal_next_spell"`
	InterruptFlags     int32   `db:"interrupt_flags"`
	CumulativeAura     int32   `db:"cumulative_aura"`
	Mechanic           int32   `db:"mechanic"`
	DefenseType        int32   `db:"defense_type"`
	CasterAuraState    int32   `db:"caster_aura_state"`
	TargetAuraState    int32   `db:"target_aura_state"`
	MaxTargets         int32   `db:"max_targets"`
	TargetCreatureType int32   `db:"target_creature_type"`
	RequiresSpellFocus int32   `db:"requires_spell_focus"`

	// Resource Cost
	PowerType        int32   `db:"power_type"`
	ManaCost         int32   `db:"mana_cost"`
	ManaCostPct      int32   `db:"mana_cost_pct"`
	ManaCostPerLevel int32   `db:"mana_cost_per_level"`
	ManaPerSecond    int32   `db:"mana_per_second"`
	Reagent          []int32 `db:"reagent"`
	ReagentCount     []int32 `db:"reagent_count"`

	// Timing (milliseconds)
	CastingTimeIndex       int32 `db:"casting_time_index"`
	RecoveryTimeMs         int64 `db:"recovery_time_ms"`
	StartRecoveryCategory  int32 `db:"start_recovery_category"`
	StartRecoveryTimeMs    int64 `db:"start_recovery_time_ms"`
	CategoryRecoveryTimeMs int64 `db:"category_recovery_time_ms"`
	RangeIndex             int32 `db:"range_index"`
	DurationIndex          int32 `db:"duration_index"`

	// Filtering/Logic
	Attributes           []int32 `db:"attributes"` // [9]uint32
	Targets              int32   `db:"targets"`
	SpellClassSet        int32   `db:"spell_class_set"`
	SpellClassMask       int64   `db:"spell_class_mask"`
	EquippedItemInvTypes int32   `db:"equipped_item_inv_types"`
	EquippedItemClass    int32   `db:"equipped_item_class"`
	EquippedItemSubclass int32   `db:"equipped_item_subclass"`
	PreventionType       int32   `db:"prevention_type"`

	// Effect 0
	Effect0                int32   `db:"effect_0"`
	EffectDieSides0        int32   `db:"effect_die_sides_0"`
	EffectRealPtsPerLevel0 float32 `db:"effect_real_pts_per_level_0"`
	EffectBasePoints0      int32   `db:"effect_base_points_0"`
	EffectMechanic0        int32   `db:"effect_mechanic_0"`
	EffectRadiusIndex0     int32   `db:"effect_radius_index_0"`
	EffectAura0            int32   `db:"effect_aura_0"`
	EffectAuraPeriod0      int32   `db:"effect_aura_period_0"`
	EffectAmplitude0       float32 `db:"effect_amplitude_0"`
	EffectChainTargets0    int32   `db:"effect_chain_targets_0"`
	EffectItemType0        int32   `db:"effect_item_type_0"`
	EffectMiscValue0       int32   `db:"effect_misc_value_0"`
	EffectTriggerSpell0    int32   `db:"effect_trigger_spell_0"`
	EffectPtsPerCombo0     float32 `db:"effect_pts_per_combo_0"`
	EffectBaseDice0        int32   `db:"effect_base_dice_0"`
	EffectDicePerLevel0    int32   `db:"effect_dice_per_level_0"`
	EffectChainAmplitude0  float32 `db:"effect_chain_amplitude_0"`
	ImplicitTargetA0       int32   `db:"implicit_target_a_0"`
	ImplicitTargetB0       int32   `db:"implicit_target_b_0"`

	// Effect 1
	Effect1                int32   `db:"effect_1"`
	EffectDieSides1        int32   `db:"effect_die_sides_1"`
	EffectRealPtsPerLevel1 float32 `db:"effect_real_pts_per_level_1"`
	EffectBasePoints1      int32   `db:"effect_base_points_1"`
	EffectMechanic1        int32   `db:"effect_mechanic_1"`
	EffectRadiusIndex1     int32   `db:"effect_radius_index_1"`
	EffectAura1            int32   `db:"effect_aura_1"`
	EffectAuraPeriod1      int32   `db:"effect_aura_period_1"`
	EffectAmplitude1       float32 `db:"effect_amplitude_1"`
	EffectChainTargets1    int32   `db:"effect_chain_targets_1"`
	EffectItemType1        int32   `db:"effect_item_type_1"`
	EffectMiscValue1       int32   `db:"effect_misc_value_1"`
	EffectTriggerSpell1    int32   `db:"effect_trigger_spell_1"`
	EffectPtsPerCombo1     float32 `db:"effect_pts_per_combo_1"`
	EffectBaseDice1        int32   `db:"effect_base_dice_1"`
	EffectDicePerLevel1    int32   `db:"effect_dice_per_level_1"`
	EffectChainAmplitude1  float32 `db:"effect_chain_amplitude_1"`
	ImplicitTargetA1       int32   `db:"implicit_target_a_1"`
	ImplicitTargetB1       int32   `db:"implicit_target_b_1"`

	// Effect 2
	Effect2                int32   `db:"effect_2"`
	EffectDieSides2        int32   `db:"effect_die_sides_2"`
	EffectRealPtsPerLevel2 float32 `db:"effect_real_pts_per_level_2"`
	EffectBasePoints2      int32   `db:"effect_base_points_2"`
	EffectMechanic2        int32   `db:"effect_mechanic_2"`
	EffectRadiusIndex2     int32   `db:"effect_radius_index_2"`
	EffectAura2            int32   `db:"effect_aura_2"`
	EffectAuraPeriod2      int32   `db:"effect_aura_period_2"`
	EffectAmplitude2       float32 `db:"effect_amplitude_2"`
	EffectChainTargets2    int32   `db:"effect_chain_targets_2"`
	EffectItemType2        int32   `db:"effect_item_type_2"`
	EffectMiscValue2       int32   `db:"effect_misc_value_2"`
	EffectTriggerSpell2    int32   `db:"effect_trigger_spell_2"`
	EffectPtsPerCombo2     float32 `db:"effect_pts_per_combo_2"`
	EffectBaseDice2        int32   `db:"effect_base_dice_2"`
	EffectDicePerLevel2    int32   `db:"effect_dice_per_level_2"`
	EffectChainAmplitude2  float32 `db:"effect_chain_amplitude_2"`
	ImplicitTargetA2       int32   `db:"implicit_target_a_2"`
	ImplicitTargetB2       int32   `db:"implicit_target_b_2"`

	// Totem Requirements
	TotemsID int32   `db:"totems_id"`
	Totem    []int32 `db:"totem"`

	// Other
	CastUI             int32   `db:"cast_ui"`
	RequiredAuraVision int32   `db:"required_aura_vision"`
	MinFactionID       int32   `db:"min_faction_id"`
	MinReputation      int32   `db:"min_reputation"`
	SpellVisualID      []int32 `db:"spell_visual_id"`

	// 3.3.5a+ Fields
	RuneCostID             int32 `db:"rune_cost_id"`
	SpellMissileID         int32 `db:"spell_missile_id"`
	DescriptionVariablesID int32 `db:"description_variables_id"`
	CasterAuraSpell        int32 `db:"caster_aura_spell"`
	TargetAuraSpell        int32 `db:"target_aura_spell"`
	ExcludeCasterAuraSpell int32 `db:"exclude_caster_aura_spell"`
	ExcludeTargetAuraSpell int32 `db:"exclude_target_aura_spell"`
	ExcludeCasterAuraState int32 `db:"exclude_caster_aura_state"`
	ExcludeTargetAuraState int32 `db:"exclude_target_aura_state"`
	ManaPerSecondPerLevel  int32 `db:"mana_per_second_per_level"`

	// Resolved metadata from LEFT JOINs (nullable — NULL when metadata tables not imported)
	CtBase       *int32   `db:"-"` // from dbc_spell_cast_times
	CtPerLevel   *int32   `db:"-"`
	CtMinimum    *int32   `db:"-"`
	DurBase      *int32   `db:"-"` // from dbc_spell_durations
	DurPerLevel  *int32   `db:"-"`
	DurMax       *int32   `db:"-"`
	RangeMin     *float32 `db:"-"` // from dbc_spell_ranges
	RangeMax     *float32 `db:"-"`
	RangeFlags   *int32   `db:"-"`
	RangeName    *string  `db:"-"`
	IconTexture  *string  `db:"-"` // from dbc_spell_icons (primary)
	ActiveIconTexture *string `db:"-"` // from dbc_spell_icons (active)
	CatFlags     *int32   `db:"-"` // from dbc_spell_categories
	CatUsesPerWeek *int32 `db:"-"`
	CatName      *string  `db:"-"`
	CatMaxCharges *int32  `db:"-"`
	CatChargeRecoveryTime *int32 `db:"-"`
	CatTypeMask  *int32   `db:"-"`
	R0Radius     *float32 `db:"-"` // from dbc_spell_radii (effect 0)
	R0RadiusPerLevel *float32 `db:"-"`
	R0RadiusMin  *float32 `db:"-"`
	R0RadiusMax  *float32 `db:"-"`
	R1Radius     *float32 `db:"-"` // from dbc_spell_radii (effect 1)
	R1RadiusPerLevel *float32 `db:"-"`
	R1RadiusMin  *float32 `db:"-"`
	R1RadiusMax  *float32 `db:"-"`
	R2Radius     *float32 `db:"-"` // from dbc_spell_radii (effect 2)
	R2RadiusPerLevel *float32 `db:"-"`
	R2RadiusMin  *float32 `db:"-"`
	R2RadiusMax  *float32 `db:"-"`
	FocusName    *string  `db:"-"` // from dbc_spell_focus_objects
}

// ToSpell converts a SpellRow to a chrondbc.Spell for use in parsing.
func (r *SpellRow) ToSpell() chrondbc.Spell {
	s := chrondbc.Spell{
		ID:                   chrondbc.SpellID(r.SpellID),
		Name_lang:            i18n.Text{i18n.English: r.Name},
		NameSubtext_lang:     i18n.Text{i18n.English: r.NameSubtext},
		Description_lang:     i18n.Text{i18n.English: r.Description},
		AuraDescription_lang: i18n.Text{i18n.English: r.AuraDescription},

		SpellIconID_:  r.SpellIconID,
		SpellIcon:     dbcmem.SpellIcon{ID: r.SpellIconID},
		ActiveIconID_: r.ActiveIconID,
		ActiveIcon:    dbcmem.SpellIcon{ID: r.ActiveIconID},

		MaxLevel:       r.MaxLevel,
		BaseLevel:      r.BaseLevel,
		SpellLevel:     r.SpellLevel,
		CategoryID_:    r.Category,
		Category:       dbcmem.SpellCategory{ID: r.Category},
		MaxTargetLevel: r.MaxTargetLevel,

		School:             chrondbc.School(r.School),
		SpellPriority:      r.SpellPriority,
		StanceBarOrder:     r.StanceBarOrder,
		ProcTypeMask:       bitmask.Bitmask32(r.ProcTypeMask),
		ProcFlags:          chrondbc.ProcFlags(r.ProcFlags),
		ProcChance:         r.ProcChance,
		ProcCharges:        r.ProcCharges,
		Speed:              r.Speed,
		DispelType:         chrondbc.DispelType(r.DispelType),
		AuraInterruptFlags: chrondbc.AuraInterruptFlags(r.AuraInterruptFlags),
		ModalNextSpell:     r.ModalNextSpell,
		InterruptFlags:     chrondbc.InterruptFlags(r.InterruptFlags),
		CumulativeAura:     r.CumulativeAura,
		Mechanic:           chrondbc.Mechanic(r.Mechanic),
		DefenseType:        chrondbc.DefenseType(r.DefenseType),
		CasterAuraState:    chrondbc.AuraState(r.CasterAuraState),
		TargetAuraState:    chrondbc.AuraState(r.TargetAuraState),
		MaxTargets:         r.MaxTargets,
		TargetCreatureType: chrondbc.TargetCreatureType(r.TargetCreatureType),
		SpellFocusID_:  r.RequiresSpellFocus,
		SpellFocus:     dbcmem.SpellFocusObject{ID: r.RequiresSpellFocus},

		PowerType:        chrondbc.Power(r.PowerType),
		ManaCost:         r.ManaCost,
		ManaCostPct:      r.ManaCostPct,
		ManaCostPerLevel: r.ManaCostPerLevel,
		ManaPerSecond:    r.ManaPerSecond,

		CastingTimeIndex_:     r.CastingTimeIndex,
		CastTime:              dbcmem.SpellCastTime{ID: r.CastingTimeIndex},
		RecoveryTime:          time.Duration(r.RecoveryTimeMs) * time.Millisecond,
		StartRecoveryCategory: r.StartRecoveryCategory,
		StartRecoveryTime:     time.Duration(r.StartRecoveryTimeMs) * time.Millisecond,
		CategoryRecoveryTime:  time.Duration(r.CategoryRecoveryTimeMs) * time.Millisecond,
		RangeIndex_:           r.RangeIndex,
		Range:                 dbcmem.SpellRange{ID: r.RangeIndex},
		DurationIndex_:        r.DurationIndex,
		Duration:              dbcmem.SpellDuration{ID: r.DurationIndex},

		Targets:              chrondbc.TargetFlags(r.Targets),
		SpellClassSet:        chrondbc.SpellClassSet(r.SpellClassSet),
		SpellClassMask:       chrondbc.SpellClassMask(r.SpellClassMask),
		EquippedItemInvTypes: chrondbc.EquippedItemInvTypes(r.EquippedItemInvTypes),
		EquippedItemClass:    chrondbc.EquippedItemClass(r.EquippedItemClass),
		EquippedItemSubclass: bitmask.Bitmask32(r.EquippedItemSubclass),
		PreventionType:       chrondbc.PreventionType(r.PreventionType),

		TotemsID: r.TotemsID,

		CastUI:             r.CastUI,
		RequiredAuraVision: r.RequiredAuraVision,
		MinFactionID:       r.MinFactionID,
		MinReputation:      r.MinReputation,

		RuneCostID:             r.RuneCostID,
		SpellMissileID:         r.SpellMissileID,
		DescriptionVariablesID: r.DescriptionVariablesID,
		CasterAuraSpell:        r.CasterAuraSpell,
		TargetAuraSpell:        r.TargetAuraSpell,
		ExcludeCasterAuraSpell: r.ExcludeCasterAuraSpell,
		ExcludeTargetAuraSpell: r.ExcludeTargetAuraSpell,
		ExcludeCasterAuraState: r.ExcludeCasterAuraState,
		ExcludeTargetAuraState: r.ExcludeTargetAuraState,
		ManaPerSecondPerLevel:  r.ManaPerSecondPerLevel,
	}

	// Reagents: [8]ItemID from []int32
	for i := 0; i < 8 && i < len(r.Reagent); i++ {
		s.Reagent[i] = chrondbc.ItemID(r.Reagent[i])
	}
	for i := 0; i < 8 && i < len(r.ReagentCount); i++ {
		s.ReagentCount[i] = r.ReagentCount[i]
	}

	// Attributes: [9]uint32 from []int32
	for i := 0; i < 9 && i < len(r.Attributes); i++ {
		s.Attrs[i] = uint32(r.Attributes[i])
	}

	// Totem: [2]ItemID from []int32
	for i := 0; i < 2 && i < len(r.Totem); i++ {
		s.Totem[i] = chrondbc.ItemID(r.Totem[i])
	}

	// SpellVisualID: [2]int32 from []int32
	for i := 0; i < 2 && i < len(r.SpellVisualID); i++ {
		s.SpellVisualID[i] = r.SpellVisualID[i]
	}

	// Effects 0-2
	s.Effect = [3]chrondbc.Effect{chrondbc.Effect(r.Effect0), chrondbc.Effect(r.Effect1), chrondbc.Effect(r.Effect2)}
	s.EffectDieSides = [3]int32{r.EffectDieSides0, r.EffectDieSides1, r.EffectDieSides2}
	s.EffectRealPointsPerLevel = [3]float32{r.EffectRealPtsPerLevel0, r.EffectRealPtsPerLevel1, r.EffectRealPtsPerLevel2}
	s.EffectBasePoints = [3]int32{r.EffectBasePoints0, r.EffectBasePoints1, r.EffectBasePoints2}
	s.EffectMechanic = [3]int32{r.EffectMechanic0, r.EffectMechanic1, r.EffectMechanic2}
	s.EffectRadiusIndex_ = [3]int32{r.EffectRadiusIndex0, r.EffectRadiusIndex1, r.EffectRadiusIndex2}
	s.EffectRadius = [3]dbcmem.SpellRadius{
		{ID: r.EffectRadiusIndex0},
		{ID: r.EffectRadiusIndex1},
		{ID: r.EffectRadiusIndex2},
	}
	s.EffectAura = [3]chrondbc.AuraEffect{chrondbc.AuraEffect(r.EffectAura0), chrondbc.AuraEffect(r.EffectAura1), chrondbc.AuraEffect(r.EffectAura2)}
	s.EffectAuraPeriod = [3]int32{r.EffectAuraPeriod0, r.EffectAuraPeriod1, r.EffectAuraPeriod2}
	s.EffectAmplitude = [3]float32{r.EffectAmplitude0, r.EffectAmplitude1, r.EffectAmplitude2}
	s.EffectChainTargets = [3]int32{r.EffectChainTargets0, r.EffectChainTargets1, r.EffectChainTargets2}
	s.EffectItemType = [3]chrondbc.ItemID{chrondbc.ItemID(r.EffectItemType0), chrondbc.ItemID(r.EffectItemType1), chrondbc.ItemID(r.EffectItemType2)}
	s.EffectMiscValue = [3]int32{r.EffectMiscValue0, r.EffectMiscValue1, r.EffectMiscValue2}
	s.EffectTriggerSpell = [3]chrondbc.SpellID{chrondbc.SpellID(r.EffectTriggerSpell0), chrondbc.SpellID(r.EffectTriggerSpell1), chrondbc.SpellID(r.EffectTriggerSpell2)}
	s.EffectPointsPerCombo = [3]float32{r.EffectPtsPerCombo0, r.EffectPtsPerCombo1, r.EffectPtsPerCombo2}
	s.EffectBaseDice = [3]int32{r.EffectBaseDice0, r.EffectBaseDice1, r.EffectBaseDice2}
	s.EffectDicePerLevel = [3]int32{r.EffectDicePerLevel0, r.EffectDicePerLevel1, r.EffectDicePerLevel2}
	s.EffectChainAmplitude = [3]float32{r.EffectChainAmplitude0, r.EffectChainAmplitude1, r.EffectChainAmplitude2}
	s.ImplicitTargetA = [3]chrondbc.ImplicitTarget{chrondbc.ImplicitTarget(r.ImplicitTargetA0), chrondbc.ImplicitTarget(r.ImplicitTargetA1), chrondbc.ImplicitTarget(r.ImplicitTargetA2)}
	s.ImplicitTargetB = [3]chrondbc.ImplicitTarget{chrondbc.ImplicitTarget(r.ImplicitTargetB0), chrondbc.ImplicitTarget(r.ImplicitTargetB1), chrondbc.ImplicitTarget(r.ImplicitTargetB2)}

	// Resolve JOINed metadata when available. When the companion DBC
	// tables have not been imported for this dataset, LEFT JOINs return
	// NULL and the resolved structs keep their ID-only zero values.
	// This is intentional — DB-backed spells should never silently fall
	// back to compiled-in globals from a different server version.
	if r.IconTexture != nil {
		s.SpellIcon = dbcmem.SpellIcon{ID: r.SpellIconID, TextureFilename: *r.IconTexture}
	}
	if r.ActiveIconTexture != nil {
		s.ActiveIcon = dbcmem.SpellIcon{ID: r.ActiveIconID, TextureFilename: *r.ActiveIconTexture}
	}
	if r.CtBase != nil {
		s.CastTime = dbcmem.SpellCastTime{ID: r.CastingTimeIndex, Base: *r.CtBase, PerLevel: derefOr(r.CtPerLevel), Minimum: derefOr(r.CtMinimum)}
	}
	if r.DurBase != nil {
		s.Duration = dbcmem.SpellDuration{ID: r.DurationIndex, Duration: *r.DurBase, DurationPerLevel: derefOr(r.DurPerLevel), MaxDuration: derefOr(r.DurMax)}
	}
	if r.RangeMin != nil {
		s.Range = dbcmem.SpellRange{ID: r.RangeIndex, RangeMin: *r.RangeMin, RangeMax: derefOrF(r.RangeMax), Flags: derefOr(r.RangeFlags), Name: derefOrS(r.RangeName)}
	}
	if r.CatName != nil || r.CatFlags != nil {
		s.Category = dbcmem.SpellCategory{ID: r.Category, Flags: derefOr(r.CatFlags), UsesPerWeek: derefOr(r.CatUsesPerWeek), Name: derefOrS(r.CatName), MaxCharges: derefOr(r.CatMaxCharges), ChargeRecoveryTime: derefOr(r.CatChargeRecoveryTime), TypeMask: derefOr(r.CatTypeMask)}
	}
	if r.R0Radius != nil {
		s.EffectRadius[0] = dbcmem.SpellRadius{ID: r.EffectRadiusIndex0, Radius: *r.R0Radius, RadiusPerLevel: derefOrF(r.R0RadiusPerLevel), RadiusMin: derefOrF(r.R0RadiusMin), RadiusMax: derefOrF(r.R0RadiusMax)}
	}
	if r.R1Radius != nil {
		s.EffectRadius[1] = dbcmem.SpellRadius{ID: r.EffectRadiusIndex1, Radius: *r.R1Radius, RadiusPerLevel: derefOrF(r.R1RadiusPerLevel), RadiusMin: derefOrF(r.R1RadiusMin), RadiusMax: derefOrF(r.R1RadiusMax)}
	}
	if r.R2Radius != nil {
		s.EffectRadius[2] = dbcmem.SpellRadius{ID: r.EffectRadiusIndex2, Radius: *r.R2Radius, RadiusPerLevel: derefOrF(r.R2RadiusPerLevel), RadiusMin: derefOrF(r.R2RadiusMin), RadiusMax: derefOrF(r.R2RadiusMax)}
	}
	if r.FocusName != nil {
		s.SpellFocus = dbcmem.SpellFocusObject{ID: r.RequiresSpellFocus, Name: *r.FocusName}
	}

	return s
}

// FromSpell converts a chrondbc.Spell to a SpellRow for database storage.
func FromSpell(datasetID uuid.UUID, s *chrondbc.Spell) SpellRow {
	r := SpellRow{
		DatasetID:       datasetID,
		SpellID:         int32(s.ID),
		Name:            s.Name(),
		NameSubtext:     s.Subtext(),
		Description:     s.Description(),
		AuraDescription: s.AuraDescription(),

		SpellIconID:  s.SpellIcon.ID,
		ActiveIconID: s.ActiveIcon.ID,

		MaxLevel:       s.MaxLevel,
		BaseLevel:      s.BaseLevel,
		SpellLevel:     s.SpellLevel,
		Category:       s.Category.ID,
		MaxTargetLevel: s.MaxTargetLevel,

		School:             int32(s.School),
		SpellPriority:      s.SpellPriority,
		StanceBarOrder:     s.StanceBarOrder,
		ProcTypeMask:       int32(s.ProcTypeMask),
		ProcFlags:          int32(s.ProcFlags),
		ProcChance:         s.ProcChance,
		ProcCharges:        s.ProcCharges,
		Speed:              s.Speed,
		DispelType:         int32(s.DispelType),
		AuraInterruptFlags: int32(s.AuraInterruptFlags),
		ModalNextSpell:     s.ModalNextSpell,
		InterruptFlags:     int32(s.InterruptFlags),
		CumulativeAura:     s.CumulativeAura,
		Mechanic:           int32(s.Mechanic),
		DefenseType:        int32(s.DefenseType),
		CasterAuraState:    int32(s.CasterAuraState),
		TargetAuraState:    int32(s.TargetAuraState),
		MaxTargets:         s.MaxTargets,
		TargetCreatureType: int32(s.TargetCreatureType),
		RequiresSpellFocus: s.SpellFocus.ID,

		PowerType:        int32(s.PowerType),
		ManaCost:         s.ManaCost,
		ManaCostPct:      s.ManaCostPct,
		ManaCostPerLevel: s.ManaCostPerLevel,
		ManaPerSecond:    s.ManaPerSecond,
		Reagent:          int32SliceFromItemIDs(s.Reagent[:]),
		ReagentCount:     s.ReagentCount[:],

		CastingTimeIndex:       s.CastTime.ID,
		RecoveryTimeMs:         s.RecoveryTime.Milliseconds(),
		StartRecoveryCategory:  s.StartRecoveryCategory,
		StartRecoveryTimeMs:    s.StartRecoveryTime.Milliseconds(),
		CategoryRecoveryTimeMs: s.CategoryRecoveryTime.Milliseconds(),
		RangeIndex:             s.Range.ID,
		DurationIndex:          s.Duration.ID,

		Attributes:           int32SliceFromUint32(s.Attrs[:]),
		Targets:              int32(s.Targets),
		SpellClassSet:        int32(s.SpellClassSet),
		SpellClassMask:       int64(s.SpellClassMask),
		EquippedItemInvTypes: int32(s.EquippedItemInvTypes),
		EquippedItemClass:    int32(s.EquippedItemClass),
		EquippedItemSubclass: int32(s.EquippedItemSubclass),
		PreventionType:       int32(s.PreventionType),

		// Effect 0
		Effect0:                int32(s.Effect[0]),
		EffectDieSides0:        s.EffectDieSides[0],
		EffectRealPtsPerLevel0: s.EffectRealPointsPerLevel[0],
		EffectBasePoints0:      s.EffectBasePoints[0],
		EffectMechanic0:        s.EffectMechanic[0],
		EffectRadiusIndex0:     s.EffectRadius[0].ID,
		EffectAura0:            int32(s.EffectAura[0]),
		EffectAuraPeriod0:      s.EffectAuraPeriod[0],
		EffectAmplitude0:       s.EffectAmplitude[0],
		EffectChainTargets0:    s.EffectChainTargets[0],
		EffectItemType0:        int32(s.EffectItemType[0]),
		EffectMiscValue0:       s.EffectMiscValue[0],
		EffectTriggerSpell0:    int32(s.EffectTriggerSpell[0]),
		EffectPtsPerCombo0:     s.EffectPointsPerCombo[0],
		EffectBaseDice0:        s.EffectBaseDice[0],
		EffectDicePerLevel0:    s.EffectDicePerLevel[0],
		EffectChainAmplitude0:  s.EffectChainAmplitude[0],
		ImplicitTargetA0:       int32(s.ImplicitTargetA[0]),
		ImplicitTargetB0:       int32(s.ImplicitTargetB[0]),

		// Effect 1
		Effect1:                int32(s.Effect[1]),
		EffectDieSides1:        s.EffectDieSides[1],
		EffectRealPtsPerLevel1: s.EffectRealPointsPerLevel[1],
		EffectBasePoints1:      s.EffectBasePoints[1],
		EffectMechanic1:        s.EffectMechanic[1],
		EffectRadiusIndex1:     s.EffectRadius[1].ID,
		EffectAura1:            int32(s.EffectAura[1]),
		EffectAuraPeriod1:      s.EffectAuraPeriod[1],
		EffectAmplitude1:       s.EffectAmplitude[1],
		EffectChainTargets1:    s.EffectChainTargets[1],
		EffectItemType1:        int32(s.EffectItemType[1]),
		EffectMiscValue1:       s.EffectMiscValue[1],
		EffectTriggerSpell1:    int32(s.EffectTriggerSpell[1]),
		EffectPtsPerCombo1:     s.EffectPointsPerCombo[1],
		EffectBaseDice1:        s.EffectBaseDice[1],
		EffectDicePerLevel1:    s.EffectDicePerLevel[1],
		EffectChainAmplitude1:  s.EffectChainAmplitude[1],
		ImplicitTargetA1:       int32(s.ImplicitTargetA[1]),
		ImplicitTargetB1:       int32(s.ImplicitTargetB[1]),

		// Effect 2
		Effect2:                int32(s.Effect[2]),
		EffectDieSides2:        s.EffectDieSides[2],
		EffectRealPtsPerLevel2: s.EffectRealPointsPerLevel[2],
		EffectBasePoints2:      s.EffectBasePoints[2],
		EffectMechanic2:        s.EffectMechanic[2],
		EffectRadiusIndex2:     s.EffectRadius[2].ID,
		EffectAura2:            int32(s.EffectAura[2]),
		EffectAuraPeriod2:      s.EffectAuraPeriod[2],
		EffectAmplitude2:       s.EffectAmplitude[2],
		EffectChainTargets2:    s.EffectChainTargets[2],
		EffectItemType2:        int32(s.EffectItemType[2]),
		EffectMiscValue2:       s.EffectMiscValue[2],
		EffectTriggerSpell2:    int32(s.EffectTriggerSpell[2]),
		EffectPtsPerCombo2:     s.EffectPointsPerCombo[2],
		EffectBaseDice2:        s.EffectBaseDice[2],
		EffectDicePerLevel2:    s.EffectDicePerLevel[2],
		EffectChainAmplitude2:  s.EffectChainAmplitude[2],
		ImplicitTargetA2:       int32(s.ImplicitTargetA[2]),
		ImplicitTargetB2:       int32(s.ImplicitTargetB[2]),

		TotemsID:           s.TotemsID,
		Totem:              int32SliceFromItemIDs(s.Totem[:]),
		CastUI:             s.CastUI,
		RequiredAuraVision: s.RequiredAuraVision,
		MinFactionID:       s.MinFactionID,
		MinReputation:      s.MinReputation,
		SpellVisualID:      s.SpellVisualID[:],

		RuneCostID:             s.RuneCostID,
		SpellMissileID:         s.SpellMissileID,
		DescriptionVariablesID: s.DescriptionVariablesID,
		CasterAuraSpell:        s.CasterAuraSpell,
		TargetAuraSpell:        s.TargetAuraSpell,
		ExcludeCasterAuraSpell: s.ExcludeCasterAuraSpell,
		ExcludeTargetAuraSpell: s.ExcludeTargetAuraSpell,
		ExcludeCasterAuraState: s.ExcludeCasterAuraState,
		ExcludeTargetAuraState: s.ExcludeTargetAuraState,
		ManaPerSecondPerLevel:  s.ManaPerSecondPerLevel,
	}
	return r
}

func int32SliceFromItemIDs(ids []chrondbc.ItemID) []int32 {
	out := make([]int32, len(ids))
	for i, id := range ids {
		out[i] = int32(id)
	}
	return out
}

func int32SliceFromUint32(vals []uint32) []int32 {
	out := make([]int32, len(vals))
	for i, v := range vals {
		out[i] = int32(v)
	}
	return out
}
