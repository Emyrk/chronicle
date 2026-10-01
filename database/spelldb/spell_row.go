// Package spelldb provides a database-backed spell type that mirrors the
// dbc_spells table. SpellRow implements pgx row scanning via db struct tags
// and converts to/from chrondbc.Spell for use in the parser and API.
package spelldb

import (
	"math"
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
	DatasetID uuid.UUID `db:"dataset_id" json:"dataset_id"`
	SpellID   int32     `db:"spell_id" json:"spell_id"`

	// Core Identification
	Name            string `db:"name" json:"name"`
	NameSubtext     string `db:"name_subtext" json:"name_subtext"`
	Description     string `db:"description" json:"description"`
	AuraDescription string `db:"aura_description" json:"aura_description"`

	// Display
	SpellIconID  int32 `db:"spell_icon_id" json:"spell_icon_id"`
	ActiveIconID int32 `db:"active_icon_id" json:"active_icon_id"`

	// Level Requirements
	MaxLevel       int32 `db:"max_level" json:"max_level"`
	BaseLevel      int32 `db:"base_level" json:"base_level"`
	SpellLevel     int32 `db:"spell_level" json:"spell_level"`
	Category       int32 `db:"category" json:"category"`
	MaxTargetLevel int32 `db:"max_target_level" json:"max_target_level"`

	// Behavior
	School             int32   `db:"school" json:"school"`
	SpellPriority      int32   `db:"spell_priority" json:"spell_priority"`
	StanceBarOrder     int32   `db:"stance_bar_order" json:"stance_bar_order"`
	ProcTypeMask       int32   `db:"proc_type_mask" json:"proc_type_mask"`
	ProcFlags          int32   `db:"proc_flags" json:"proc_flags"`
	ProcChance         int32   `db:"proc_chance" json:"proc_chance"`
	ProcCharges        int32   `db:"proc_charges" json:"proc_charges"`
	Speed              float32 `db:"speed" json:"speed"`
	DispelType         int32   `db:"dispel_type" json:"dispel_type"`
	AuraInterruptFlags int32   `db:"aura_interrupt_flags" json:"aura_interrupt_flags"`
	ModalNextSpell     int32   `db:"modal_next_spell" json:"modal_next_spell"`
	InterruptFlags     int32   `db:"interrupt_flags" json:"interrupt_flags"`
	CumulativeAura     int32   `db:"cumulative_aura" json:"cumulative_aura"`
	Mechanic           int32   `db:"mechanic" json:"mechanic"`
	DefenseType        int32   `db:"defense_type" json:"defense_type"`
	CasterAuraState    int32   `db:"caster_aura_state" json:"caster_aura_state"`
	TargetAuraState    int32   `db:"target_aura_state" json:"target_aura_state"`
	MaxTargets         int32   `db:"max_targets" json:"max_targets"`
	TargetCreatureType int32   `db:"target_creature_type" json:"target_creature_type"`
	RequiresSpellFocus int32   `db:"requires_spell_focus" json:"requires_spell_focus"`

	// Reagents
	Reagent      []int32 `db:"reagent" json:"reagent"`
	ReagentCount []int32 `db:"reagent_count" json:"reagent_count"`

	// Timing (milliseconds)
	CastingTimeIndex       int32 `db:"casting_time_index" json:"casting_time_index"`
	RecoveryTimeMs         int64 `db:"recovery_time_ms" json:"recovery_time_ms"`
	StartRecoveryCategory  int32 `db:"start_recovery_category" json:"start_recovery_category"`
	StartRecoveryTimeMs    int64 `db:"start_recovery_time_ms" json:"start_recovery_time_ms"`
	CategoryRecoveryTimeMs int64 `db:"category_recovery_time_ms" json:"category_recovery_time_ms"`
	RangeIndex             int32 `db:"range_index" json:"range_index"`
	DurationIndex          int32 `db:"duration_index" json:"duration_index"`

	// Filtering/Logic
	Attributes           []int32 `db:"attributes" json:"attributes"` // [9]uint32
	Targets              int32   `db:"targets" json:"targets"`
	SpellClassSet        int32   `db:"spell_class_set" json:"spell_class_set"`
	SpellClassMask       int64   `db:"spell_class_mask" json:"spell_class_mask"`
	EquippedItemInvTypes int32   `db:"equipped_item_inv_types" json:"equipped_item_inv_types"`
	EquippedItemClass    int32   `db:"equipped_item_class" json:"equipped_item_class"`
	EquippedItemSubclass int32   `db:"equipped_item_subclass" json:"equipped_item_subclass"`
	PreventionType       int32   `db:"prevention_type" json:"prevention_type"`

	// Totem Requirements
	TotemsID int32   `db:"totems_id" json:"totems_id"`
	Totem    []int32 `db:"totem" json:"totem"`

	// Other
	CastUI             int32   `db:"cast_ui" json:"cast_ui"`
	RequiredAuraVision int32   `db:"required_aura_vision" json:"required_aura_vision"`
	MinFactionID       int32   `db:"min_faction_id" json:"min_faction_id"`
	MinReputation      int32   `db:"min_reputation" json:"min_reputation"`
	SpellVisualID      []int32 `db:"spell_visual_id" json:"spell_visual_id"`

	// 3.3.5a+ Fields
	RuneCostID             int32 `db:"rune_cost_id" json:"rune_cost_id"`
	SpellMissileID         int32 `db:"spell_missile_id" json:"spell_missile_id"`
	DescriptionVariablesID int32 `db:"description_variables_id" json:"description_variables_id"`
	CasterAuraSpell        int32 `db:"caster_aura_spell" json:"caster_aura_spell"`
	TargetAuraSpell        int32 `db:"target_aura_spell" json:"target_aura_spell"`
	ExcludeCasterAuraSpell int32 `db:"exclude_caster_aura_spell" json:"exclude_caster_aura_spell"`
	ExcludeTargetAuraSpell int32 `db:"exclude_target_aura_spell" json:"exclude_target_aura_spell"`
	ExcludeCasterAuraState int32 `db:"exclude_caster_aura_state" json:"exclude_caster_aura_state"`
	ExcludeTargetAuraState int32 `db:"exclude_target_aura_state" json:"exclude_target_aura_state"`
	ManaPerSecondPerLevel  int32 `db:"mana_per_second_per_level" json:"mana_per_second_per_level"`

	// Canonical normalized components loaded with the base row.
	Effects  []chrondbc.SpellEffect  `db:"-" json:"-"`
	Powers   []chrondbc.SpellPower   `db:"-" json:"-"`
	Variants []chrondbc.SpellVariant `db:"-" json:"-"`

	// Resolved metadata from LEFT JOINs (nullable — NULL when metadata tables not imported)
	CtBase                *int32   `db:"-" json:"ct_base"` // from dbc_spell_cast_times
	CtPerLevel            *int32   `db:"-" json:"ct_per_level"`
	CtMinimum             *int32   `db:"-" json:"ct_minimum"`
	DurBase               *int32   `db:"-" json:"dur_base"` // from dbc_spell_durations
	DurPerLevel           *int32   `db:"-" json:"dur_per_level"`
	DurMax                *int32   `db:"-" json:"dur_max"`
	RangeMin              *float32 `db:"-" json:"range_min"` // from dbc_spell_ranges
	RangeMax              *float32 `db:"-" json:"range_max"`
	RangeFlags            *int32   `db:"-" json:"range_flags"`
	RangeName             *string  `db:"-" json:"range_name"`
	IconTexture           *string  `db:"-" json:"icon_texture"`        // from dbc_spell_icons (primary)
	ActiveIconTexture     *string  `db:"-" json:"active_icon_texture"` // from dbc_spell_icons (active)
	CatFlags              *int32   `db:"-" json:"cat_flags"`           // from dbc_spell_categories
	CatUsesPerWeek        *int32   `db:"-" json:"cat_uses_per_week"`
	CatName               *string  `db:"-" json:"cat_name"`
	CatMaxCharges         *int32   `db:"-" json:"cat_max_charges"`
	CatChargeRecoveryTime *int32   `db:"-" json:"cat_charge_recovery_time"`
	CatTypeMask           *int32   `db:"-" json:"cat_type_mask"`
	FocusName             *string  `db:"-" json:"focus_name"`     // from dbc_spell_focus_objects
	DescVariables         *string  `db:"-" json:"desc_variables"` // from dbc_spell_description_variables
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
		SpellFocusID_:      r.RequiresSpellFocus,
		SpellFocus:         dbcmem.SpellFocusObject{ID: r.RequiresSpellFocus},

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
	if r.FocusName != nil {
		s.SpellFocus = dbcmem.SpellFocusObject{ID: r.RequiresSpellFocus, Name: *r.FocusName}
	}
	if r.DescVariables != nil {
		s.DescriptionVariables = *r.DescVariables
	}

	s.Effects = r.Effects
	s.Powers = r.Powers
	if len(r.Powers) > 0 {
		if power := s.DefaultPower(); power != nil {
			s.PowerType = chrondbc.Power(power.PowerType)
			s.ManaCost = power.ManaCost
			s.ManaCostPct = int32(math.Round(float64(power.PowerCostPct)))
			s.ManaCostPerLevel = power.ManaCostPerLevel
			s.ManaPerSecond = power.ManaPerSecond
		}
	}
	s.Variants = r.Variants

	return s
}

// FromSpell converts a chrondbc.Spell to its dbc_spells base row.
// Effects and powers are persisted separately in normalized component tables.
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

		Reagent:      int32SliceFromItemIDs(s.Reagent[:]),
		ReagentCount: s.ReagentCount[:],

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
