package vanilla

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const preparedSpellGraphType = "parsernext/vanilla.PreparedSpell"

type preparedSpellGraphState struct {
	Compatibility snapshot.Compatibility `json:"compatibility"`
	Reference     json.RawMessage        `json:"reference"`
}

// RegisterPreparedSpellGraphOwner freezes caller-preloaded effective spells for
// one authoritative compatibility identity. No fetcher, override, or query runs
// during capture or restore. Unknown IDs must be explicitly prepared, including
// any intentional UnknownSpell fallback. The archive cannot select a resolver.
//
// Ownergraph preserves pointer identity: repeated references to one Spell remain
// canonical; separate same-ID owners remain separate. Each restored owner gets
// its own mutable storage, never aliases of the prepared baseline.
func RegisterPreparedSpellGraphOwner(r *ownergraph.Registry, identity snapshot.Compatibility, prepared map[chrondbc.SpellID]*chrondbc.Spell) error {
	if err := identity.Validate(); err != nil {
		return err
	}
	if prepared == nil {
		return fmt.Errorf("prepared spells required")
	}
	baseline := make(map[chrondbc.SpellID]*chrondbc.Spell, len(prepared))
	for id, spell := range prepared {
		if spell == nil || spell.ID != id {
			return fmt.Errorf("invalid prepared spell %d", id)
		}
		baseline[id] = copyPreparedSpell(spell)
	}
	return ownergraph.Register(r, ownergraph.Codec[chrondbc.Spell]{
		Type: preparedSpellGraphType, Version: 1, Init: func() *chrondbc.Spell { return new(chrondbc.Spell) },
		Capture: func(spell *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) {
			trusted, ok := baseline[spell.ID]
			if !ok || !equalPreparedSpell(spell, trusted) {
				return nil, fmt.Errorf("spell %d differs from prepared effective data", spell.ID)
			}
			ref, err := (SpellReference{ID: spell.ID}).Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(preparedSpellGraphState{identity, ref})
		},
		Restore: func(spell *chrondbc.Spell, version uint32, b []byte, _ *ownergraph.Restore) error {
			if version != 1 {
				return fmt.Errorf("unsupported prepared spell version %d", version)
			}
			var state preparedSpellGraphState
			if err := decodePreparedSpellGraph(b, &state); err != nil {
				return err
			}
			if err := identity.Check(state.Compatibility); err != nil {
				return err
			}
			ref, err := DecodeSpellReference(SpellReferenceVersion, state.Reference)
			if err != nil {
				return err
			}
			trusted, ok := baseline[ref.ID]
			if !ok {
				return fmt.Errorf("spell %d is not prepared", ref.ID)
			}
			*spell = *copyPreparedSpell(trusted)
			return nil
		},
	})
}

// Reject duplicate object keys recursively, including the embedded reference.
func decodePreparedSpellGraph(b []byte, out *preparedSpellGraphState) error {
	var visit func(*json.Decoder) error
	visit = func(d *json.Decoder) error {
		token, err := d.Token()
		if err != nil {
			return err
		}
		delim, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			keys := map[string]bool{}
			for d.More() {
				key, err := d.Token()
				if err != nil {
					return err
				}
				name := key.(string)
				if keys[name] {
					return fmt.Errorf("duplicate spell graph field %s", name)
				}
				keys[name] = true
				if err := visit(d); err != nil {
					return err
				}
			}
		case '[':
			for d.More() {
				if err := visit(d); err != nil {
					return err
				}
			}
		default:
			return fmt.Errorf("unexpected spell graph delimiter")
		}
		_, err = d.Token()
		return err
	}
	d := json.NewDecoder(bytes.NewReader(b))
	if err := visit(d); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing spell graph data")
	}
	d = json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	return d.Decode(out)
}

// Keep these typed copies and comparisons aligned with chrondbc.Spell and its
// normalized components. Spell.MarshalJSON is an API projection, not a lossless
// state representation (notably raw FK IDs are omitted).
func copyPreparedSpell(s *chrondbc.Spell) *chrondbc.Spell {
	if s == nil {
		return nil
	}
	out := *s
	out.Name_lang = maps.Clone(s.Name_lang)
	out.NameSubtext_lang = maps.Clone(s.NameSubtext_lang)
	out.Description_lang = maps.Clone(s.Description_lang)
	out.AuraDescription_lang = maps.Clone(s.AuraDescription_lang)
	out.Effects = slices.Clone(s.Effects)
	for i, e := range s.Effects {
		out.Effects[i].EffectRadiusIndex = slices.Clone(e.EffectRadiusIndex)
		out.Effects[i].EffectMiscValue = slices.Clone(e.EffectMiscValue)
		out.Effects[i].ImplicitTarget = slices.Clone(e.ImplicitTarget)
		out.Effects[i].EffectSpellClassMask = slices.Clone(e.EffectSpellClassMask)
		if e.EffectBasePointsF != nil {
			value := *e.EffectBasePointsF
			out.Effects[i].EffectBasePointsF = &value
		}
	}
	out.Powers = slices.Clone(s.Powers)
	out.Variants = slices.Clone(s.Variants)
	for i, v := range s.Variants {
		out.Variants[i] = copyPreparedVariant(v)
	}
	return &out
}

func copyPreparedVariant(v chrondbc.SpellVariant) chrondbc.SpellVariant {
	out := v
	if v.Misc != nil {
		value := *v.Misc
		value.Attributes = slices.Clone(v.Misc.Attributes)
		out.Misc = &value
	}
	if v.AuraOptions != nil {
		value := *v.AuraOptions
		value.ProcTypeMask = slices.Clone(v.AuraOptions.ProcTypeMask)
		out.AuraOptions = &value
	}
	if v.AuraRestrictions != nil {
		value := *v.AuraRestrictions
		out.AuraRestrictions = &value
	}
	if v.ClassOptions != nil {
		value := *v.ClassOptions
		value.SpellClassMask = slices.Clone(v.ClassOptions.SpellClassMask)
		out.ClassOptions = &value
	}
	if v.Interrupts != nil {
		value := *v.Interrupts
		value.AuraInterruptFlags = slices.Clone(v.Interrupts.AuraInterruptFlags)
		value.ChannelInterruptFlags = slices.Clone(v.Interrupts.ChannelInterruptFlags)
		out.Interrupts = &value
	}
	if v.Categories != nil {
		value := *v.Categories
		out.Categories = &value
	}
	if v.Cooldowns != nil {
		value := *v.Cooldowns
		out.Cooldowns = &value
	}
	if v.Levels != nil {
		value := *v.Levels
		out.Levels = &value
	}
	if v.TargetRestrictions != nil {
		value := *v.TargetRestrictions
		out.TargetRestrictions = &value
	}
	return out
}

func equalPreparedSpell(a, b *chrondbc.Spell) bool {
	if a == nil || b == nil {
		return a == b
	}
	if a.ID != b.ID {
		return false
	}
	if (a.Name_lang == nil) != (b.Name_lang == nil) || !maps.Equal(a.Name_lang, b.Name_lang) {
		return false
	}
	if (a.NameSubtext_lang == nil) != (b.NameSubtext_lang == nil) || !maps.Equal(a.NameSubtext_lang, b.NameSubtext_lang) {
		return false
	}
	if (a.Description_lang == nil) != (b.Description_lang == nil) || !maps.Equal(a.Description_lang, b.Description_lang) {
		return false
	}
	if (a.AuraDescription_lang == nil) != (b.AuraDescription_lang == nil) || !maps.Equal(a.AuraDescription_lang, b.AuraDescription_lang) {
		return false
	}
	if a.SpellIcon != b.SpellIcon {
		return false
	}
	if a.ActiveIcon != b.ActiveIcon {
		return false
	}
	if a.MaxLevel != b.MaxLevel {
		return false
	}
	if a.BaseLevel != b.BaseLevel {
		return false
	}
	if a.SpellLevel != b.SpellLevel {
		return false
	}
	if a.Category != b.Category {
		return false
	}
	if a.MaxTargetLevel != b.MaxTargetLevel {
		return false
	}
	if a.School != b.School {
		return false
	}
	if a.SpellPriority != b.SpellPriority {
		return false
	}
	if a.StanceBarOrder != b.StanceBarOrder {
		return false
	}
	if a.ProcTypeMask != b.ProcTypeMask {
		return false
	}
	if a.ProcFlags != b.ProcFlags {
		return false
	}
	if a.ProcChance != b.ProcChance {
		return false
	}
	if a.ProcCharges != b.ProcCharges {
		return false
	}
	if a.Speed != b.Speed {
		return false
	}
	if a.DispelType != b.DispelType {
		return false
	}
	if a.AuraInterruptFlags != b.AuraInterruptFlags {
		return false
	}
	if a.ModalNextSpell != b.ModalNextSpell {
		return false
	}
	if a.InterruptFlags != b.InterruptFlags {
		return false
	}
	if a.CumulativeAura != b.CumulativeAura {
		return false
	}
	if a.Mechanic != b.Mechanic {
		return false
	}
	if a.DefenseType != b.DefenseType {
		return false
	}
	if a.CasterAuraState != b.CasterAuraState {
		return false
	}
	if a.TargetAuraState != b.TargetAuraState {
		return false
	}
	if a.MaxTargets != b.MaxTargets {
		return false
	}
	if a.TargetCreatureType != b.TargetCreatureType {
		return false
	}
	if a.SpellFocus != b.SpellFocus {
		return false
	}
	if a.PowerType != b.PowerType {
		return false
	}
	if a.ManaCost != b.ManaCost {
		return false
	}
	if a.ManaCostPct != b.ManaCostPct {
		return false
	}
	if a.ManaCostPerLevel != b.ManaCostPerLevel {
		return false
	}
	if a.ManaPerSecond != b.ManaPerSecond {
		return false
	}
	if a.Reagent != b.Reagent {
		return false
	}
	if a.ReagentCount != b.ReagentCount {
		return false
	}
	if a.CastTime != b.CastTime {
		return false
	}
	if a.RecoveryTime != b.RecoveryTime {
		return false
	}
	if a.StartRecoveryCategory != b.StartRecoveryCategory {
		return false
	}
	if a.StartRecoveryTime != b.StartRecoveryTime {
		return false
	}
	if a.CategoryRecoveryTime != b.CategoryRecoveryTime {
		return false
	}
	if a.Range != b.Range {
		return false
	}
	if a.Duration != b.Duration {
		return false
	}
	if a.Attrs != b.Attrs {
		return false
	}
	if a.Targets != b.Targets {
		return false
	}
	if a.SpellClassSet != b.SpellClassSet {
		return false
	}
	if a.SpellClassMask != b.SpellClassMask {
		return false
	}
	if a.EquippedItemInvTypes != b.EquippedItemInvTypes {
		return false
	}
	if a.EquippedItemClass != b.EquippedItemClass {
		return false
	}
	if a.EquippedItemSubclass != b.EquippedItemSubclass {
		return false
	}
	if a.PreventionType != b.PreventionType {
		return false
	}
	if !(equalPreparedSlice(a.Effects, b.Effects, equalPreparedSpellEffect)) {
		return false
	}
	if a.TotemsID != b.TotemsID {
		return false
	}
	if a.Totem != b.Totem {
		return false
	}
	if a.CastUI != b.CastUI {
		return false
	}
	if a.RequiredAuraVision != b.RequiredAuraVision {
		return false
	}
	if a.MinFactionID != b.MinFactionID {
		return false
	}
	if a.MinReputation != b.MinReputation {
		return false
	}
	if a.SpellVisualID != b.SpellVisualID {
		return false
	}
	if a.RuneCostID != b.RuneCostID {
		return false
	}
	if a.SpellMissileID != b.SpellMissileID {
		return false
	}
	if a.DescriptionVariablesID != b.DescriptionVariablesID {
		return false
	}
	if a.CasterAuraSpell != b.CasterAuraSpell {
		return false
	}
	if a.TargetAuraSpell != b.TargetAuraSpell {
		return false
	}
	if a.ExcludeCasterAuraSpell != b.ExcludeCasterAuraSpell {
		return false
	}
	if a.ExcludeTargetAuraSpell != b.ExcludeTargetAuraSpell {
		return false
	}
	if a.ExcludeCasterAuraState != b.ExcludeCasterAuraState {
		return false
	}
	if a.ExcludeTargetAuraState != b.ExcludeTargetAuraState {
		return false
	}
	if a.ManaPerSecondPerLevel != b.ManaPerSecondPerLevel {
		return false
	}
	if a.DescriptionVariables != b.DescriptionVariables {
		return false
	}
	if a.SpellIconID_ != b.SpellIconID_ {
		return false
	}
	if a.ActiveIconID_ != b.ActiveIconID_ {
		return false
	}
	if a.CastingTimeIndex_ != b.CastingTimeIndex_ {
		return false
	}
	if a.RangeIndex_ != b.RangeIndex_ {
		return false
	}
	if a.DurationIndex_ != b.DurationIndex_ {
		return false
	}
	if a.CategoryID_ != b.CategoryID_ {
		return false
	}
	if a.SpellFocusID_ != b.SpellFocusID_ {
		return false
	}
	if (a.Powers == nil) != (b.Powers == nil) || !slices.Equal(a.Powers, b.Powers) {
		return false
	}
	if !(equalPreparedSlice(a.Variants, b.Variants, equalPreparedSpellVariant)) {
		return false
	}
	return true
}

func equalPreparedSpellEffect(a, b chrondbc.SpellEffect) bool {
	if a.DatasetID != b.DatasetID {
		return false
	}
	if a.SpellID != b.SpellID {
		return false
	}
	if a.DifficultyID != b.DifficultyID {
		return false
	}
	if a.EffectIndex != b.EffectIndex {
		return false
	}
	if a.SourceID != b.SourceID {
		return false
	}
	if a.Effect != b.Effect {
		return false
	}
	if a.EffectDieSides != b.EffectDieSides {
		return false
	}
	if a.EffectRealPointsPerLevel != b.EffectRealPointsPerLevel {
		return false
	}
	if a.EffectBasePoints != b.EffectBasePoints {
		return false
	}
	if !(equalPreparedScalarPointer(a.EffectBasePointsF, b.EffectBasePointsF)) {
		return false
	}
	if a.EffectMechanic != b.EffectMechanic {
		return false
	}
	if a.EffectRadius != b.EffectRadius {
		return false
	}
	if (a.EffectRadiusIndex == nil) != (b.EffectRadiusIndex == nil) || !slices.Equal(a.EffectRadiusIndex, b.EffectRadiusIndex) {
		return false
	}
	if a.EffectAura != b.EffectAura {
		return false
	}
	if a.EffectAuraPeriod != b.EffectAuraPeriod {
		return false
	}
	if a.EffectAmplitude != b.EffectAmplitude {
		return false
	}
	if a.EffectChainTargets != b.EffectChainTargets {
		return false
	}
	if a.EffectItemType != b.EffectItemType {
		return false
	}
	if (a.EffectMiscValue == nil) != (b.EffectMiscValue == nil) || !slices.Equal(a.EffectMiscValue, b.EffectMiscValue) {
		return false
	}
	if a.EffectTriggerSpell != b.EffectTriggerSpell {
		return false
	}
	if a.EffectPointsPerCombo != b.EffectPointsPerCombo {
		return false
	}
	if a.EffectBaseDice != b.EffectBaseDice {
		return false
	}
	if a.EffectDicePerLevel != b.EffectDicePerLevel {
		return false
	}
	if a.EffectChainAmplitude != b.EffectChainAmplitude {
		return false
	}
	if (a.ImplicitTarget == nil) != (b.ImplicitTarget == nil) || !slices.Equal(a.ImplicitTarget, b.ImplicitTarget) {
		return false
	}
	if a.BonusCoefficientFromAP != b.BonusCoefficientFromAP {
		return false
	}
	if a.Coefficient != b.Coefficient {
		return false
	}
	if a.EffectAttributes != b.EffectAttributes {
		return false
	}
	if a.EffectBonusCoefficient != b.EffectBonusCoefficient {
		return false
	}
	if a.EffectPointsPerResource != b.EffectPointsPerResource {
		return false
	}
	if a.EffectPosFacing != b.EffectPosFacing {
		return false
	}
	if (a.EffectSpellClassMask == nil) != (b.EffectSpellClassMask == nil) || !slices.Equal(a.EffectSpellClassMask, b.EffectSpellClassMask) {
		return false
	}
	if a.GroupSizeBasePointsCoefficient != b.GroupSizeBasePointsCoefficient {
		return false
	}
	if a.NodeField120063534001 != b.NodeField120063534001 {
		return false
	}
	if a.PVPMultiplier != b.PVPMultiplier {
		return false
	}
	if a.ResourceCoefficient != b.ResourceCoefficient {
		return false
	}
	if a.ScalingClass != b.ScalingClass {
		return false
	}
	if a.Variance != b.Variance {
		return false
	}
	return true
}

func equalPreparedSpellVariant(a, b chrondbc.SpellVariant) bool {
	if a.DatasetID != b.DatasetID {
		return false
	}
	if a.SpellID != b.SpellID {
		return false
	}
	if a.DifficultyID != b.DifficultyID {
		return false
	}
	if !(equalPreparedPointer(a.Misc, b.Misc, equalPreparedModernSpellMisc)) {
		return false
	}
	if !(equalPreparedPointer(a.AuraOptions, b.AuraOptions, equalPreparedModernSpellAuraOptions)) {
		return false
	}
	if !(equalPreparedScalarPointer(a.AuraRestrictions, b.AuraRestrictions)) {
		return false
	}
	if !(equalPreparedPointer(a.ClassOptions, b.ClassOptions, equalPreparedModernSpellClassOptions)) {
		return false
	}
	if !(equalPreparedPointer(a.Interrupts, b.Interrupts, equalPreparedModernSpellInterrupts)) {
		return false
	}
	if !(equalPreparedScalarPointer(a.Categories, b.Categories)) {
		return false
	}
	if !(equalPreparedScalarPointer(a.Cooldowns, b.Cooldowns)) {
		return false
	}
	if !(equalPreparedScalarPointer(a.Levels, b.Levels)) {
		return false
	}
	if !(equalPreparedScalarPointer(a.TargetRestrictions, b.TargetRestrictions)) {
		return false
	}
	return true
}

func equalPreparedModernSpellMisc(a, b chrondbc.ModernSpellMisc) bool {
	if a.ID != b.ID {
		return false
	}
	if a.ActiveIconFileDataID != b.ActiveIconFileDataID {
		return false
	}
	if a.ActiveSpellVisualScript != b.ActiveSpellVisualScript {
		return false
	}
	if (a.Attributes == nil) != (b.Attributes == nil) || !slices.Equal(a.Attributes, b.Attributes) {
		return false
	}
	if a.CastingTimeIndex != b.CastingTimeIndex {
		return false
	}
	if a.ContentTuningID != b.ContentTuningID {
		return false
	}
	if a.DurationIndex != b.DurationIndex {
		return false
	}
	if a.LaunchDelay != b.LaunchDelay {
		return false
	}
	if a.MinDuration != b.MinDuration {
		return false
	}
	if a.PVPDurationIndex != b.PVPDurationIndex {
		return false
	}
	if a.RangeIndex != b.RangeIndex {
		return false
	}
	if a.SchoolMask != b.SchoolMask {
		return false
	}
	if a.ShowFutureSpellPlayerConditionID != b.ShowFutureSpellPlayerConditionID {
		return false
	}
	if a.Speed != b.Speed {
		return false
	}
	if a.SpellIconFileDataID != b.SpellIconFileDataID {
		return false
	}
	if a.SpellVisualScript != b.SpellVisualScript {
		return false
	}
	return true
}

func equalPreparedModernSpellAuraOptions(a, b chrondbc.ModernSpellAuraOptions) bool {
	if a.ID != b.ID {
		return false
	}
	if a.CumulativeAura != b.CumulativeAura {
		return false
	}
	if a.ProcCategoryRecovery != b.ProcCategoryRecovery {
		return false
	}
	if a.ProcChance != b.ProcChance {
		return false
	}
	if a.ProcCharges != b.ProcCharges {
		return false
	}
	if (a.ProcTypeMask == nil) != (b.ProcTypeMask == nil) || !slices.Equal(a.ProcTypeMask, b.ProcTypeMask) {
		return false
	}
	if a.SpellProcsPerMinuteID != b.SpellProcsPerMinuteID {
		return false
	}
	return true
}

func equalPreparedModernSpellClassOptions(a, b chrondbc.ModernSpellClassOptions) bool {
	if a.ID != b.ID {
		return false
	}
	if a.ModalNextSpell != b.ModalNextSpell {
		return false
	}
	if a.SpellClassSet != b.SpellClassSet {
		return false
	}
	if (a.SpellClassMask == nil) != (b.SpellClassMask == nil) || !slices.Equal(a.SpellClassMask, b.SpellClassMask) {
		return false
	}
	return true
}

func equalPreparedModernSpellInterrupts(a, b chrondbc.ModernSpellInterrupts) bool {
	if a.ID != b.ID {
		return false
	}
	if (a.AuraInterruptFlags == nil) != (b.AuraInterruptFlags == nil) || !slices.Equal(a.AuraInterruptFlags, b.AuraInterruptFlags) {
		return false
	}
	if (a.ChannelInterruptFlags == nil) != (b.ChannelInterruptFlags == nil) || !slices.Equal(a.ChannelInterruptFlags, b.ChannelInterruptFlags) {
		return false
	}
	if a.InterruptFlags != b.InterruptFlags {
		return false
	}
	return true
}

func equalPreparedSlice[T any](a, b []T, equal func(T, T) bool) bool {
	if (a == nil) != (b == nil) {
		return false
	}
	return slices.EqualFunc(a, b, equal)
}
func equalPreparedPointer[T any](a, b *T, equal func(T, T) bool) bool {
	if a == nil || b == nil {
		return a == b
	}
	return equal(*a, *b)
}
func equalPreparedScalarPointer[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
