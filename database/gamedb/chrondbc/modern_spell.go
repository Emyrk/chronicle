package chrondbc

import (
	"math"
	"sort"
	"time"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/internal/bitmask"
	"github.com/google/uuid"
)

// SpellEffect is one normalized SpellEffect row for a spell.
type SpellEffect struct {
	DatasetID                      uuid.UUID `json:"dataset_id"`
	SpellID                        SpellID   `json:"spell_id"`
	DifficultyID                   int32     `json:"difficulty_id"`
	EffectIndex                    int32     `json:"effect_index"`
	SourceID                       int32     `json:"source_id"`
	BonusCoefficientFromAP         float32   `json:"bonus_coefficient_from_ap"`
	Coefficient                    float32   `json:"coefficient"`
	Effect                         int32     `json:"effect"`
	EffectAmplitude                float32   `json:"effect_amplitude"`
	EffectAttributes               int32     `json:"effect_attributes"`
	EffectAura                     int32     `json:"effect_aura"`
	EffectAuraPeriod               int32     `json:"effect_aura_period"`
	EffectBasePointsF              float32   `json:"effect_base_points_f"`
	EffectBonusCoefficient         float32   `json:"effect_bonus_coefficient"`
	EffectChainAmplitude           float32   `json:"effect_chain_amplitude"`
	EffectChainTargets             int32     `json:"effect_chain_targets"`
	EffectItemType                 int32     `json:"effect_item_type"`
	EffectMechanic                 int32     `json:"effect_mechanic"`
	EffectMiscValue                []int32   `json:"effect_misc_value"`
	EffectPointsPerResource        float32   `json:"effect_points_per_resource"`
	EffectPosFacing                float32   `json:"effect_pos_facing"`
	EffectRadiusIndex              []int32   `json:"effect_radius_index"`
	EffectDieSides                 int32     `json:"effect_die_sides"`
	EffectBaseDice                 int32     `json:"effect_base_dice"`
	EffectDicePerLevel             int32     `json:"effect_dice_per_level"`
	EffectRealPointsPerLevel       float32   `json:"effect_real_points_per_level"`
	EffectSpellClassMask           []int32   `json:"effect_spell_class_mask"`
	EffectTriggerSpell             int32     `json:"effect_trigger_spell"`
	GroupSizeBasePointsCoefficient float32   `json:"group_size_base_points_coefficient"`
	NodeField120063534001          int32     `json:"node_field_12_0_0_63534_001"`
	PVPMultiplier                  float32   `json:"pvp_multiplier"`
	ResourceCoefficient            float32   `json:"resource_coefficient"`
	ScalingClass                   int32     `json:"scaling_class"`
	ImplicitTarget                 []int32   `json:"implicit_target"`
	Variance                       float32   `json:"variance"`
}

// BasePoints returns the normalized effective base value rounded to the nearest integer.
func (e SpellEffect) BasePoints() int32 {
	return int32(math.Round(float64(e.EffectBasePointsF)))
}

// LegacyBasePoints returns the fixed-array DBC encoding, where consumers add one.
func (e SpellEffect) LegacyBasePoints() int32 {
	return e.BasePoints() - 1
}

// MiscValue returns the first context-dependent misc value.
func (e SpellEffect) MiscValue() int32 {
	return firstInt32(e.EffectMiscValue)
}

// ModernSpellEffect is retained for source compatibility.
// Deprecated: use SpellEffect.
type ModernSpellEffect = SpellEffect

// SpellPower is one normalized SpellPower row for a spell.
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

// ModernSpellPower is retained for source compatibility.
// Deprecated: use SpellPower.
type ModernSpellPower = SpellPower

// SpellVariant contains the optional normalized components for one spell difficulty.
type SpellVariant struct {
	DatasetID          uuid.UUID                `json:"dataset_id"`
	SpellID            SpellID                  `json:"spell_id"`
	DifficultyID       int32                    `json:"difficulty_id"`
	Misc               *SpellMisc               `json:"misc,omitempty"`
	AuraOptions        *SpellAuraOptions        `json:"aura_options,omitempty"`
	AuraRestrictions   *SpellAuraRestrictions   `json:"aura_restrictions,omitempty"`
	ClassOptions       *SpellClassOptions       `json:"class_options,omitempty"`
	Interrupts         *SpellInterrupts         `json:"interrupts,omitempty"`
	Categories         *SpellCategories         `json:"categories,omitempty"`
	Cooldowns          *SpellCooldowns          `json:"cooldowns,omitempty"`
	Levels             *SpellLevels             `json:"levels,omitempty"`
	TargetRestrictions *SpellTargetRestrictions `json:"target_restrictions,omitempty"`
}

// ModernSpellVariant is retained for source compatibility.
// Deprecated: use SpellVariant.
type ModernSpellVariant = SpellVariant

type SpellMisc struct {
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

type SpellAuraOptions struct {
	ID                    int32   `json:"id"`
	CumulativeAura        int32   `json:"cumulative_aura"`
	ProcCategoryRecovery  int32   `json:"proc_category_recovery"`
	ProcChance            int32   `json:"proc_chance"`
	ProcCharges           int32   `json:"proc_charges"`
	ProcTypeMask          []int32 `json:"proc_type_mask"`
	SpellProcsPerMinuteID int32   `json:"spell_procs_per_minute_id"`
}

type SpellAuraRestrictions struct {
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

type SpellClassOptions struct {
	ID             int32   `json:"id"`
	ModalNextSpell int32   `json:"modal_next_spell"`
	SpellClassSet  int32   `json:"spell_class_set"`
	SpellClassMask []int32 `json:"spell_class_mask"`
}

type SpellInterrupts struct {
	ID                    int32   `json:"id"`
	AuraInterruptFlags    []int32 `json:"aura_interrupt_flags"`
	ChannelInterruptFlags []int32 `json:"channel_interrupt_flags"`
	InterruptFlags        int32   `json:"interrupt_flags"`
}

type SpellCategories struct {
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

type SpellCooldowns struct {
	ID                   int32 `json:"id"`
	AuraSpellID          int32 `json:"aura_spell_id"`
	CategoryRecoveryTime int32 `json:"category_recovery_time"`
	RecoveryTime         int32 `json:"recovery_time"`
	StartRecoveryTime    int32 `json:"start_recovery_time"`
}

type SpellLevels struct {
	ID                  int32 `json:"id"`
	BaseLevel           int32 `json:"base_level"`
	MaxLevel            int32 `json:"max_level"`
	MaxPassiveAuraLevel int32 `json:"max_passive_aura_level"`
	SpellLevel          int32 `json:"spell_level"`
}

type SpellTargetRestrictions struct {
	ID                 int32   `json:"id"`
	ConeDegrees        float32 `json:"cone_degrees"`
	MaxTargetLevel     int32   `json:"max_target_level"`
	MaxTargets         int32   `json:"max_targets"`
	TargetCreatureType int32   `json:"target_creature_type"`
	Targets            int32   `json:"targets"`
	Width              float32 `json:"width"`
}

// EnsureNormalizedComponents synthesizes normalized difficulty-zero components
// from the legacy projection when a spell has no normalized rows. Existing
// normalized rows are only sorted; they are never replaced by legacy data.
func (s *Spell) EnsureNormalizedComponents() {
	if len(s.Effects) != 0 || len(s.Powers) != 0 || len(s.Variants) != 0 {
		s.sortNormalizedComponents()
		return
	}

	s.Effects = make([]SpellEffect, 3)
	for i := range s.Effects {
		basePoints := float32(s.EffectBasePoints[i] + 1)
		if i < len(s.EffectBasePointsF) {
			basePoints = s.EffectBasePointsF[i]
		}
		s.Effects[i] = SpellEffect{
			SpellID:                  s.ID,
			EffectIndex:              int32(i),
			Effect:                   int32(s.Effect[i]),
			EffectAmplitude:          s.EffectAmplitude[i],
			EffectAura:               int32(s.EffectAura[i]),
			EffectAuraPeriod:         s.EffectAuraPeriod[i],
			EffectBasePointsF:        basePoints,
			EffectChainAmplitude:     s.EffectChainAmplitude[i],
			EffectChainTargets:       s.EffectChainTargets[i],
			EffectItemType:           int32(s.EffectItemType[i]),
			EffectMechanic:           s.EffectMechanic[i],
			EffectMiscValue:          []int32{s.EffectMiscValue[i]},
			EffectPointsPerResource:  s.EffectPointsPerCombo[i],
			EffectRadiusIndex:        []int32{s.EffectRadiusIndex_[i]},
			EffectDieSides:           s.EffectDieSides[i],
			EffectBaseDice:           s.EffectBaseDice[i],
			EffectDicePerLevel:       s.EffectDicePerLevel[i],
			EffectRealPointsPerLevel: s.EffectRealPointsPerLevel[i],
			EffectTriggerSpell:       int32(s.EffectTriggerSpell[i]),
			ImplicitTarget:           []int32{int32(s.ImplicitTargetA[i]), int32(s.ImplicitTargetB[i])},
		}
	}

	s.Powers = []SpellPower{{
		SpellID:          s.ID,
		ManaCost:         s.ManaCost,
		ManaCostPerLevel: s.ManaCostPerLevel,
		ManaPerSecond:    s.ManaPerSecond,
		PowerCostPct:     float32(s.ManaCostPct),
		PowerType:        int32(s.PowerType),
	}}

	attrs := make([]int32, len(s.Attrs))
	for i, attr := range s.Attrs {
		attrs[i] = int32(attr)
	}
	classMask := uint64(s.SpellClassMask)
	s.Variants = []SpellVariant{{
		SpellID:      s.ID,
		DifficultyID: 0,
		Misc: &SpellMisc{
			Attributes:       attrs,
			CastingTimeIndex: s.CastingTimeIndex_,
			DurationIndex:    s.DurationIndex_,
			RangeIndex:       s.RangeIndex_,
			SchoolMask:       int32(s.School),
			Speed:            s.Speed,
		},
		AuraOptions: &SpellAuraOptions{
			CumulativeAura: s.CumulativeAura,
			ProcChance:     s.ProcChance,
			ProcCharges:    s.ProcCharges,
			ProcTypeMask:   []int32{int32(s.ProcTypeMask)},
		},
		AuraRestrictions: &SpellAuraRestrictions{
			CasterAuraSpell:        s.CasterAuraSpell,
			CasterAuraState:        int32(s.CasterAuraState),
			ExcludeCasterAuraSpell: s.ExcludeCasterAuraSpell,
			ExcludeCasterAuraState: s.ExcludeCasterAuraState,
			ExcludeTargetAuraSpell: s.ExcludeTargetAuraSpell,
			ExcludeTargetAuraState: s.ExcludeTargetAuraState,
			TargetAuraSpell:        s.TargetAuraSpell,
			TargetAuraState:        int32(s.TargetAuraState),
		},
		ClassOptions: &SpellClassOptions{
			ModalNextSpell: s.ModalNextSpell,
			SpellClassSet:  int32(s.SpellClassSet),
			SpellClassMask: []int32{int32(classMask), int32(classMask >> 32)},
		},
		Interrupts: &SpellInterrupts{
			AuraInterruptFlags: []int32{int32(s.AuraInterruptFlags)},
			InterruptFlags:     int32(s.InterruptFlags),
		},
		Categories: &SpellCategories{
			Category:              s.CategoryID_,
			DefenseType:           int32(s.DefenseType),
			DispelType:            int32(s.DispelType),
			Mechanic:              int32(s.Mechanic),
			PreventionType:        int32(s.PreventionType),
			StartRecoveryCategory: s.StartRecoveryCategory,
		},
		Cooldowns: &SpellCooldowns{
			CategoryRecoveryTime: durationMilliseconds(s.CategoryRecoveryTime),
			RecoveryTime:         durationMilliseconds(s.RecoveryTime),
			StartRecoveryTime:    durationMilliseconds(s.StartRecoveryTime),
		},
		Levels: &SpellLevels{
			BaseLevel:  s.BaseLevel,
			MaxLevel:   s.MaxLevel,
			SpellLevel: s.SpellLevel,
		},
		TargetRestrictions: &SpellTargetRestrictions{
			MaxTargetLevel:     s.MaxTargetLevel,
			MaxTargets:         s.MaxTargets,
			TargetCreatureType: int32(s.TargetCreatureType),
			Targets:            int32(s.Targets),
		},
	}}
	s.sortNormalizedComponents()
}

// EffectsForDifficulty resolves each effect index independently. Exact-difficulty
// rows replace difficulty-zero rows at the same index, while missing indexes
// inherit their difficulty-zero rows. The result is sorted by index and source ID.
func (s *Spell) EffectsForDifficulty(difficultyID int32) []SpellEffect {
	effects := effectsAtDifficulty(s.Effects, difficultyID)
	if difficultyID != 0 {
		exactIndexes := make(map[int32]struct{}, len(effects))
		for _, effect := range effects {
			exactIndexes[effect.EffectIndex] = struct{}{}
		}
		for _, effect := range effectsAtDifficulty(s.Effects, 0) {
			if _, overridden := exactIndexes[effect.EffectIndex]; !overridden {
				effects = append(effects, effect)
			}
		}
	}
	sort.Slice(effects, func(i, j int) bool {
		if effects[i].EffectIndex != effects[j].EffectIndex {
			return effects[i].EffectIndex < effects[j].EffectIndex
		}
		return effects[i].SourceID < effects[j].SourceID
	})
	return effects
}

// EffectForDifficulty returns one effect by index using exact-difficulty then
// difficulty-zero fallback semantics.
func (s *Spell) EffectForDifficulty(difficultyID, effectIndex int32) (SpellEffect, bool) {
	for _, effect := range s.EffectsForDifficulty(difficultyID) {
		if effect.EffectIndex == effectIndex {
			return effect, true
		}
	}
	return SpellEffect{}, false
}

// PrimaryPower returns the first power after deterministic order-index/source-ID sorting.
func (s *Spell) PrimaryPower() (SpellPower, bool) {
	if len(s.Powers) == 0 {
		return SpellPower{}, false
	}
	powers := append([]SpellPower(nil), s.Powers...)
	sort.Slice(powers, func(i, j int) bool {
		if powers[i].OrderIndex != powers[j].OrderIndex {
			return powers[i].OrderIndex < powers[j].OrderIndex
		}
		return powers[i].SourceID < powers[j].SourceID
	})
	return powers[0], true
}

// ResolveVariant returns the exact difficulty variant when present, otherwise
// it falls back to difficulty zero.
func (s *Spell) ResolveVariant(difficultyID int32) (SpellVariant, bool) {
	for _, variant := range s.Variants {
		if variant.DifficultyID == difficultyID {
			return variant, true
		}
	}
	if difficultyID != 0 {
		for _, variant := range s.Variants {
			if variant.DifficultyID == 0 {
				return variant, true
			}
		}
	}
	return SpellVariant{}, false
}

// ProjectNormalizedDifficultyZeroToLegacy explicitly projects normalized
// difficulty-zero data onto the legacy Spell fields. Effects outside indexes
// 0..2 are intentionally ignored, and float base points use the legacy
// round(value)-1 encoding.
func (s *Spell) ProjectNormalizedDifficultyZeroToLegacy() {
	s.Effect = [3]Effect{}
	s.EffectDieSides = [3]int32{}
	s.EffectBaseDice = [3]int32{}
	s.EffectDicePerLevel = [3]int32{}
	s.EffectRealPointsPerLevel = [3]float32{}
	s.EffectBasePoints = [3]int32{}
	s.EffectBasePointsF = make([]float32, 3)
	s.EffectMechanic = [3]int32{}
	s.EffectRadius = [3]dbcmem.SpellRadius{}
	s.EffectRadiusIndex_ = [3]int32{}
	s.EffectAura = [3]AuraEffect{}
	s.EffectAuraPeriod = [3]int32{}
	s.EffectAmplitude = [3]float32{}
	s.EffectChainTargets = [3]int32{}
	s.EffectItemType = [3]ItemID{}
	s.EffectMiscValue = [3]int32{}
	s.EffectTriggerSpell = [3]SpellID{}
	s.EffectPointsPerCombo = [3]float32{}
	s.EffectChainAmplitude = [3]float32{}
	s.ImplicitTargetA = [3]ImplicitTarget{}
	s.ImplicitTargetB = [3]ImplicitTarget{}
	for _, effect := range s.EffectsForDifficulty(0) {
		if effect.EffectIndex < 0 || effect.EffectIndex > 2 {
			continue
		}
		i := int(effect.EffectIndex)
		s.Effect[i] = Effect(effect.Effect)
		s.EffectDieSides[i] = effect.EffectDieSides
		s.EffectBaseDice[i] = effect.EffectBaseDice
		s.EffectDicePerLevel[i] = effect.EffectDicePerLevel
		s.EffectRealPointsPerLevel[i] = effect.EffectRealPointsPerLevel
		s.EffectBasePointsF[i] = effect.EffectBasePointsF
		s.EffectBasePoints[i] = int32(math.Round(float64(effect.EffectBasePointsF))) - 1
		s.EffectMechanic[i] = effect.EffectMechanic
		s.EffectRadiusIndex_[i] = firstInt32(effect.EffectRadiusIndex)
		s.EffectAura[i] = AuraEffect(effect.EffectAura)
		s.EffectAuraPeriod[i] = effect.EffectAuraPeriod
		s.EffectAmplitude[i] = effect.EffectAmplitude
		s.EffectChainTargets[i] = effect.EffectChainTargets
		s.EffectItemType[i] = ItemID(effect.EffectItemType)
		s.EffectMiscValue[i] = firstInt32(effect.EffectMiscValue)
		s.EffectTriggerSpell[i] = SpellID(effect.EffectTriggerSpell)
		s.EffectPointsPerCombo[i] = effect.EffectPointsPerResource
		s.EffectChainAmplitude[i] = effect.EffectChainAmplitude
		s.ImplicitTargetA[i] = ImplicitTarget(firstInt32(effect.ImplicitTarget))
		s.ImplicitTargetB[i] = ImplicitTarget(int32At(effect.ImplicitTarget, 1))
	}

	if power, ok := s.PrimaryPower(); ok {
		s.PowerType = Power(power.PowerType)
		s.ManaCost = power.ManaCost
		s.ManaCostPct = int32(math.Round(float64(power.PowerCostPct)))
		s.ManaCostPerLevel = power.ManaCostPerLevel
		s.ManaPerSecond = power.ManaPerSecond
	}

	variant, ok := s.ResolveVariant(0)
	if !ok {
		return
	}
	if x := variant.Misc; x != nil {
		for i := range s.Attrs {
			s.Attrs[i] = uint32(int32At(x.Attributes, i))
		}
		s.CastingTimeIndex_ = x.CastingTimeIndex
		s.DurationIndex_ = x.DurationIndex
		s.RangeIndex_ = x.RangeIndex
		s.School = School(x.SchoolMask)
		s.Speed = x.Speed
		s.SpellIconID_ = x.SpellIconFileDataID
		s.ActiveIconID_ = x.ActiveIconFileDataID
	}
	if x := variant.AuraOptions; x != nil {
		s.CumulativeAura = x.CumulativeAura
		s.ProcChance = x.ProcChance
		s.ProcCharges = x.ProcCharges
		s.ProcTypeMask = bitmask.Bitmask32(firstInt32(x.ProcTypeMask))
	}
	if x := variant.AuraRestrictions; x != nil {
		s.CasterAuraSpell = x.CasterAuraSpell
		s.CasterAuraState = AuraState(x.CasterAuraState)
		s.ExcludeCasterAuraSpell = x.ExcludeCasterAuraSpell
		s.ExcludeCasterAuraState = x.ExcludeCasterAuraState
		s.ExcludeTargetAuraSpell = x.ExcludeTargetAuraSpell
		s.ExcludeTargetAuraState = x.ExcludeTargetAuraState
		s.TargetAuraSpell = x.TargetAuraSpell
		s.TargetAuraState = AuraState(x.TargetAuraState)
	}
	if x := variant.ClassOptions; x != nil {
		s.ModalNextSpell = x.ModalNextSpell
		s.SpellClassSet = SpellClassSet(x.SpellClassSet)
		s.SpellClassMask = NewSpellClassMask(int32At(x.SpellClassMask, 0), int32At(x.SpellClassMask, 1))
	}
	if x := variant.Interrupts; x != nil {
		s.InterruptFlags = InterruptFlags(x.InterruptFlags)
		s.AuraInterruptFlags = AuraInterruptFlags(firstInt32(x.AuraInterruptFlags))
	}
	if x := variant.Categories; x != nil {
		s.CategoryID_ = x.Category
		s.DefenseType = DefenseType(x.DefenseType)
		s.DispelType = DispelType(x.DispelType)
		s.Mechanic = Mechanic(x.Mechanic)
		s.PreventionType = PreventionType(x.PreventionType)
		s.StartRecoveryCategory = x.StartRecoveryCategory
	}
	if x := variant.Cooldowns; x != nil {
		s.CategoryRecoveryTime = time.Duration(x.CategoryRecoveryTime) * time.Millisecond
		s.RecoveryTime = time.Duration(x.RecoveryTime) * time.Millisecond
		s.StartRecoveryTime = time.Duration(x.StartRecoveryTime) * time.Millisecond
	}
	if x := variant.Levels; x != nil {
		s.BaseLevel = x.BaseLevel
		s.MaxLevel = x.MaxLevel
		s.SpellLevel = x.SpellLevel
	}
	if x := variant.TargetRestrictions; x != nil {
		s.MaxTargetLevel = x.MaxTargetLevel
		s.MaxTargets = x.MaxTargets
		s.TargetCreatureType = TargetCreatureType(x.TargetCreatureType)
		s.Targets = TargetFlags(x.Targets)
	}
}

func (s *Spell) sortNormalizedComponents() {
	sort.Slice(s.Effects, func(i, j int) bool {
		if s.Effects[i].DifficultyID != s.Effects[j].DifficultyID {
			return s.Effects[i].DifficultyID < s.Effects[j].DifficultyID
		}
		if s.Effects[i].EffectIndex != s.Effects[j].EffectIndex {
			return s.Effects[i].EffectIndex < s.Effects[j].EffectIndex
		}
		return s.Effects[i].SourceID < s.Effects[j].SourceID
	})
	sort.Slice(s.Powers, func(i, j int) bool {
		if s.Powers[i].OrderIndex != s.Powers[j].OrderIndex {
			return s.Powers[i].OrderIndex < s.Powers[j].OrderIndex
		}
		return s.Powers[i].SourceID < s.Powers[j].SourceID
	})
	sort.SliceStable(s.Variants, func(i, j int) bool {
		return s.Variants[i].DifficultyID < s.Variants[j].DifficultyID
	})
}

func effectsAtDifficulty(effects []SpellEffect, difficultyID int32) []SpellEffect {
	result := make([]SpellEffect, 0, len(effects))
	for _, effect := range effects {
		if effect.DifficultyID == difficultyID {
			result = append(result, effect)
		}
	}
	return result
}

func durationMilliseconds(value time.Duration) int32 {
	return int32(value / time.Millisecond)
}

func firstInt32(values []int32) int32 {
	return int32At(values, 0)
}

func int32At(values []int32, index int) int32 {
	if index >= 0 && index < len(values) {
		return values[index]
	}
	return 0
}

// Deprecated modern-prefixed component names retained for source compatibility.
// Deprecated: use SpellMisc.
type ModernSpellMisc = SpellMisc

// Deprecated: use SpellAuraOptions.
type ModernSpellAuraOptions = SpellAuraOptions

// Deprecated: use SpellAuraRestrictions.
type ModernSpellAuraRestrictions = SpellAuraRestrictions

// Deprecated: use SpellClassOptions.
type ModernSpellClassOptions = SpellClassOptions

// Deprecated: use SpellInterrupts.
type ModernSpellInterrupts = SpellInterrupts

// Deprecated: use SpellCategories.
type ModernSpellCategories = SpellCategories

// Deprecated: use SpellCooldowns.
type ModernSpellCooldowns = SpellCooldowns

// Deprecated: use SpellLevels.
type ModernSpellLevels = SpellLevels

// Deprecated: use SpellTargetRestrictions.
type ModernSpellTargetRestrictions = SpellTargetRestrictions
