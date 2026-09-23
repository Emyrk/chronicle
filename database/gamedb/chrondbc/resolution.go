package chrondbc

import (
	"time"

	"github.com/Emyrk/chronicle/internal/bitmask"
)

// DefaultEffects returns all effects for difficulty zero. Effect indexes are
// explicit and may be sparse. Multiple rows with the same index are preserved.
func (s *Spell) DefaultEffects() []SpellEffect {
	return s.effectsForExactDifficulty(0)
}

// EffectsForDifficulty returns the exact difficulty's effects when any exist,
// otherwise it falls back to difficulty zero. It never merges rows by index.
func (s *Spell) EffectsForDifficulty(difficultyID int32) []SpellEffect {
	if difficultyID != 0 {
		if effects := s.effectsForExactDifficulty(difficultyID); len(effects) > 0 {
			return effects
		}
	}
	return s.DefaultEffects()
}

func (s *Spell) effectsForExactDifficulty(difficultyID int32) []SpellEffect {
	var effects []SpellEffect
	for i := range s.Effects {
		if s.Effects[i].DifficultyID == difficultyID {
			effects = append(effects, s.Effects[i])
		}
	}
	return effects
}

// EffectByIndexForDifficulty returns the first selected effect with the
// requested explicit index. Difficulty selection follows EffectsForDifficulty.
func (s *Spell) EffectByIndexForDifficulty(difficultyID, index int32) *SpellEffect {
	selectedDifficulty := int32(0)
	if difficultyID != 0 {
		for i := range s.Effects {
			if s.Effects[i].DifficultyID == difficultyID {
				selectedDifficulty = difficultyID
				break
			}
		}
	}
	for i := range s.Effects {
		if s.Effects[i].DifficultyID == selectedDifficulty && s.Effects[i].EffectIndex == index {
			return &s.Effects[i]
		}
	}
	return nil
}

// DefaultPower returns the first power by OrderIndex and then SourceID.
func (s *Spell) DefaultPower() *SpellPower {
	var selected *SpellPower
	for i := range s.Powers {
		power := &s.Powers[i]
		if selected == nil || power.OrderIndex < selected.OrderIndex ||
			(power.OrderIndex == selected.OrderIndex && power.SourceID < selected.SourceID) {
			selected = power
		}
	}
	return selected
}

// PowerByOrderIndex returns the first power with the requested order index,
// preferring the lowest source ID when more than one row shares that index.
func (s *Spell) PowerByOrderIndex(orderIndex int32) *SpellPower {
	var selected *SpellPower
	for i := range s.Powers {
		power := &s.Powers[i]
		if power.OrderIndex != orderIndex {
			continue
		}
		if selected == nil || power.SourceID < selected.SourceID {
			selected = power
		}
	}
	return selected
}

// PowerByType returns the first ordered power with the requested resource type.
func (s *Spell) PowerByType(powerType int32) *SpellPower {
	var selected *SpellPower
	for i := range s.Powers {
		power := &s.Powers[i]
		if power.PowerType != powerType {
			continue
		}
		if selected == nil || power.OrderIndex < selected.OrderIndex ||
			(power.OrderIndex == selected.OrderIndex && power.SourceID < selected.SourceID) {
			selected = power
		}
	}
	return selected
}

// Resolve returns a spell view for difficultyID without modifying the receiver.
// Top-level fields are the difficulty-zero defaults. An exact difficulty
// variant overrides only the components it contains; missing components inherit
// the top-level defaults. Effects are selected as a complete difficulty set and
// fall back to difficulty zero when no exact set exists.
//
// The returned spell retains the full Powers and Variants collections. Resolve
// is an explicit compatibility projection for top-level scalar and fixed-width
// fields; the canonical component rows remain available without truncation.
func (s *Spell) Resolve(difficultyID int32) *Spell {
	if s == nil || !s.hasDifficultyOverrides() {
		return s
	}

	resolved := cloneSpell(s)
	resolved.Effects = cloneEffects(s.EffectsForDifficulty(difficultyID))
	if difficultyID == 0 {
		return resolved
	}

	variant := s.variantForExactDifficulty(difficultyID)
	if variant != nil {
		applyVariant(resolved, variant)
	}
	return resolved
}

func (s *Spell) hasDifficultyOverrides() bool {
	for i := range s.Effects {
		if s.Effects[i].DifficultyID != 0 {
			return true
		}
	}
	for i := range s.Variants {
		if s.Variants[i].DifficultyID != 0 {
			return true
		}
	}
	return false
}

func (s *Spell) variantForExactDifficulty(difficultyID int32) *SpellVariant {
	for i := range s.Variants {
		if s.Variants[i].DifficultyID == difficultyID {
			return &s.Variants[i]
		}
	}
	return nil
}

func applyVariant(s *Spell, variant *SpellVariant) {
	if misc := variant.Misc; misc != nil {
		s.ActiveIconID_ = misc.ActiveIconFileDataID
		s.ActiveIcon.ID = misc.ActiveIconFileDataID
		s.SpellIconID_ = misc.SpellIconFileDataID
		s.SpellIcon.ID = misc.SpellIconFileDataID
		s.CastingTimeIndex_ = misc.CastingTimeIndex
		s.CastTime.ID = misc.CastingTimeIndex
		s.DurationIndex_ = misc.DurationIndex
		s.Duration.ID = misc.DurationIndex
		s.RangeIndex_ = misc.RangeIndex
		s.Range.ID = misc.RangeIndex
		s.School = School(misc.SchoolMask)
		s.Speed = misc.Speed
		for i := range s.Attrs {
			s.Attrs[i] = 0
		}
		for i := 0; i < len(s.Attrs) && i < len(misc.Attributes); i++ {
			s.Attrs[i] = uint32(misc.Attributes[i])
		}
	}
	if options := variant.AuraOptions; options != nil {
		s.CumulativeAura = options.CumulativeAura
		s.ProcChance = options.ProcChance
		s.ProcCharges = options.ProcCharges
		if len(options.ProcTypeMask) > 0 {
			s.ProcTypeMask = bitmask.Bitmask32(options.ProcTypeMask[0])
		} else {
			s.ProcTypeMask = 0
		}
	}
	if restrictions := variant.AuraRestrictions; restrictions != nil {
		s.CasterAuraSpell = restrictions.CasterAuraSpell
		s.CasterAuraState = AuraState(restrictions.CasterAuraState)
		s.ExcludeCasterAuraSpell = restrictions.ExcludeCasterAuraSpell
		s.ExcludeCasterAuraState = restrictions.ExcludeCasterAuraState
		s.ExcludeTargetAuraSpell = restrictions.ExcludeTargetAuraSpell
		s.ExcludeTargetAuraState = restrictions.ExcludeTargetAuraState
		s.TargetAuraSpell = restrictions.TargetAuraSpell
		s.TargetAuraState = AuraState(restrictions.TargetAuraState)
	}
	if classOptions := variant.ClassOptions; classOptions != nil {
		s.ModalNextSpell = classOptions.ModalNextSpell
		s.SpellClassSet = SpellClassSet(classOptions.SpellClassSet)
		if len(classOptions.SpellClassMask) > 0 {
			var high int32
			if len(classOptions.SpellClassMask) > 1 {
				high = classOptions.SpellClassMask[1]
			}
			s.SpellClassMask = NewSpellClassMask(classOptions.SpellClassMask[0], high)
		} else {
			s.SpellClassMask = 0
		}
	}
	if interrupts := variant.Interrupts; interrupts != nil {
		s.InterruptFlags = InterruptFlags(interrupts.InterruptFlags)
		if len(interrupts.AuraInterruptFlags) > 0 {
			s.AuraInterruptFlags = AuraInterruptFlags(interrupts.AuraInterruptFlags[0])
		} else {
			s.AuraInterruptFlags = 0
		}
	}
	if categories := variant.Categories; categories != nil {
		s.CategoryID_ = categories.Category
		s.Category.ID = categories.Category
		s.DefenseType = DefenseType(categories.DefenseType)
		s.DispelType = DispelType(categories.DispelType)
		s.Mechanic = Mechanic(categories.Mechanic)
		s.PreventionType = PreventionType(categories.PreventionType)
		s.StartRecoveryCategory = categories.StartRecoveryCategory
	}
	if cooldowns := variant.Cooldowns; cooldowns != nil {
		s.CategoryRecoveryTime = time.Duration(cooldowns.CategoryRecoveryTime) * time.Millisecond
		s.RecoveryTime = time.Duration(cooldowns.RecoveryTime) * time.Millisecond
		s.StartRecoveryTime = time.Duration(cooldowns.StartRecoveryTime) * time.Millisecond
	}
	if levels := variant.Levels; levels != nil {
		s.BaseLevel = levels.BaseLevel
		s.MaxLevel = levels.MaxLevel
		s.SpellLevel = levels.SpellLevel
	}
	if restrictions := variant.TargetRestrictions; restrictions != nil {
		s.MaxTargetLevel = restrictions.MaxTargetLevel
		s.MaxTargets = restrictions.MaxTargets
		s.TargetCreatureType = TargetCreatureType(restrictions.TargetCreatureType)
		s.Targets = TargetFlags(restrictions.Targets)
	}
}

func cloneSpell(s *Spell) *Spell {
	clone := *s
	clone.Effects = cloneEffects(s.Effects)
	clone.Powers = append([]SpellPower(nil), s.Powers...)
	clone.Variants = cloneVariants(s.Variants)
	return &clone
}

func cloneEffects(effects []SpellEffect) []SpellEffect {
	cloned := append([]SpellEffect(nil), effects...)
	for i := range cloned {
		if cloned[i].EffectBasePointsF != nil {
			value := *cloned[i].EffectBasePointsF
			cloned[i].EffectBasePointsF = &value
		}
		cloned[i].EffectRadiusIndex = append([]int32(nil), cloned[i].EffectRadiusIndex...)
		cloned[i].EffectMiscValue = append([]int32(nil), cloned[i].EffectMiscValue...)
		cloned[i].ImplicitTarget = append([]int32(nil), cloned[i].ImplicitTarget...)
		cloned[i].EffectSpellClassMask = append([]int32(nil), cloned[i].EffectSpellClassMask...)
	}
	return cloned
}

func cloneVariants(variants []SpellVariant) []SpellVariant {
	cloned := append([]SpellVariant(nil), variants...)
	for i := range cloned {
		variant := &cloned[i]
		if variant.Misc != nil {
			value := *variant.Misc
			value.Attributes = append([]int32(nil), value.Attributes...)
			variant.Misc = &value
		}
		if variant.AuraOptions != nil {
			value := *variant.AuraOptions
			value.ProcTypeMask = append([]int32(nil), value.ProcTypeMask...)
			variant.AuraOptions = &value
		}
		if variant.AuraRestrictions != nil {
			value := *variant.AuraRestrictions
			variant.AuraRestrictions = &value
		}
		if variant.ClassOptions != nil {
			value := *variant.ClassOptions
			value.SpellClassMask = append([]int32(nil), value.SpellClassMask...)
			variant.ClassOptions = &value
		}
		if variant.Interrupts != nil {
			value := *variant.Interrupts
			value.AuraInterruptFlags = append([]int32(nil), value.AuraInterruptFlags...)
			value.ChannelInterruptFlags = append([]int32(nil), value.ChannelInterruptFlags...)
			variant.Interrupts = &value
		}
		if variant.Categories != nil {
			value := *variant.Categories
			variant.Categories = &value
		}
		if variant.Cooldowns != nil {
			value := *variant.Cooldowns
			variant.Cooldowns = &value
		}
		if variant.Levels != nil {
			value := *variant.Levels
			variant.Levels = &value
		}
		if variant.TargetRestrictions != nil {
			value := *variant.TargetRestrictions
			variant.TargetRestrictions = &value
		}
	}
	return cloned
}
