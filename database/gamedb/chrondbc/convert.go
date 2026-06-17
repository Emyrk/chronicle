package chrondbc

import (
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Emyrk/chronicle/internal/bitmask"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
)

// type Table[T any] interface {
//	Underlying() *dbc.Table
//	Len() int
//	Range(f func(cursor *T) bool) error
//	Index(i int) (*T, error)
//}

var _ dbcdb.Table[Spell] = (*SpellsDBC)(nil)

type SpellsDBC struct {
	under dbcdb.Table[dbdefs.Ent_Spell]
}

func NewSpells(v *dbc.Table) *SpellsDBC {
	return &SpellsDBC{
		under: dbcdb.WrapTable[dbdefs.Ent_Spell](v),
	}
}

func (s SpellsDBC) Underlying() *dbc.Table          { return s.under.Underlying() }
func (s SpellsDBC) Len() int                        { return s.under.Len() }
func (s SpellsDBC) StringRef(i int) (string, error) { return s.under.StringRef(i) }

func (s SpellsDBC) Range(f func(cursor *Spell) bool) error {
	return s.under.Range(func(cursor *dbdefs.Ent_Spell) bool {
		sp := SpellFromDB(cursor)
		return f(sp)
	})
}

func (s SpellsDBC) Index(i int) (*Spell, error) {
	dbSp, err := s.under.Index(i)
	if err != nil {
		return nil, err
	}
	sp := SpellFromDB(dbSp)
	return sp, nil
}

func (s SpellsDBC) ID(id int) (*Spell, error) {
	dbSp, err := s.under.ID(id)
	if err != nil {
		if strings.Contains(err.Error(), "record not found") {
			return nil, SpellNotFound(id)
		}
		return nil, err
	}
	sp := SpellFromDB(dbSp)
	return sp, nil
}

// SpellFromDB converts a raw DBC spell entry to our typed Spell struct.
func SpellFromDB(def *dbdefs.Ent_Spell) *Spell {
	var sch School
	switch def.School {
	case 0:
		sch = SchoolPhysical
	case 1:
		sch = SchoolHoly
	case 2:
		sch = SchoolFire
	case 3:
		sch = SchoolNature
	case 4:
		sch = SchoolFrost
	case 5:
		sch = SchoolShadow
	case 6:
		sch = SchoolArcane
	}

	if def.SchoolMask != 0 {
		// (1=Phys,2=Holy,4=Fire,8=Nature,16=Frost,32=Shadow,64=Arcane)
		if def.SchoolMask&0x01 != 0 {
			sch |= SchoolPhysical
		}
		if def.SchoolMask&0x02 != 0 {
			sch |= SchoolHoly
		}
		if def.SchoolMask&0x04 != 0 {
			sch |= SchoolFire
		}
		if def.SchoolMask&0x08 != 0 {
			sch |= SchoolNature
		}
		if def.SchoolMask&0x10 != 0 {
			sch |= SchoolFrost
		}
		if def.SchoolMask&0x20 != 0 {
			sch |= SchoolShadow
		}
		if def.SchoolMask&0x40 != 0 {
			sch |= SchoolArcane
		}
	}

	s := &Spell{
		// === Core Identification ===
		ID:                   SpellID(def.ID),
		Name_lang:            def.Name_lang,
		NameSubtext_lang:     def.NameSubtext_lang,
		Description_lang:     def.Description_lang,
		AuraDescription_lang: def.AuraDescription_lang,

		// === Display ===
		SpellIcon:     dbcmem.GetSpellIcon(def.SpellIconID),
		ActiveIcon:    dbcmem.GetSpellIcon(def.ActiveIconID),
		SpellIconID_:  def.SpellIconID,
		ActiveIconID_: def.ActiveIconID,

		// === Level Requirements ===
		MaxLevel:       def.MaxLevel,
		BaseLevel:      def.BaseLevel,
		SpellLevel:     def.SpellLevel,
		Category:    dbcmem.GetSpellCategory(def.Category),
		CategoryID_: def.Category,
		MaxTargetLevel: def.MaxTargetLevel,

		// === Behavior ===
		School:             sch,
		SpellPriority:      def.SpellPriority,
		StanceBarOrder:     def.StanceBarOrder,
		ProcTypeMask:       bitmask.Bitmask32(def.ProcTypeMask),
		ProcFlags:          ProcFlags(def.ProcFlags),
		ProcChance:         def.ProcChance,
		ProcCharges:        def.ProcCharges,
		Speed:              def.Speed,
		DispelType:         DispelType(def.DispelType),
		InterruptFlags:     InterruptFlags(def.InterruptFlags),
		ModalNextSpell:     def.ModalNextSpell,
		CumulativeAura:     def.CumulativeAura,
		Mechanic:           Mechanic(def.Mechanic),
		DefenseType:        DefenseType(def.DefenseType),
		CasterAuraState:    AuraState(def.CasterAuraState),
		TargetAuraState:    AuraState(def.TargetAuraState),
		MaxTargets:         def.MaxTargets,
		TargetCreatureType: TargetCreatureType(def.TargetCreatureType),
		SpellFocus:    dbcmem.GetSpellFocusObject(def.RequiresSpellFocus),
		SpellFocusID_: def.RequiresSpellFocus,

		// === Resource Cost ===
		PowerType:        Power(def.PowerType),
		ManaCost:         def.ManaCost,
		ManaCostPct:      def.ManaCostPct,
		ManaCostPerLevel: def.ManaCostPerLevel,
		ManaPerSecond:    def.ManaPerSecond,

		// === Timing ===
		CastTime:             dbcmem.GetCastTime(def.CastingTimeIndex),
		CastingTimeIndex_:    def.CastingTimeIndex,
		// DBC stores these as millisecond integers; scale to a real
		// time.Duration so Go duration math (.Seconds(), etc.) is correct.
		// JSON marshals time.Duration as its int64 nanosecond value.
		RecoveryTime:          time.Duration(def.RecoveryTime) * time.Millisecond,
		StartRecoveryCategory: def.StartRecoveryCategory,
		StartRecoveryTime:     time.Duration(def.StartRecoveryTime) * time.Millisecond,
		CategoryRecoveryTime:  time.Duration(def.CategoryRecoveryTime) * time.Millisecond,
		Range:          dbcmem.GetSpellRange(def.RangeIndex),
		Duration:       dbcmem.GetSpellDuration(def.DurationIndex),
		RangeIndex_:    def.RangeIndex,
		DurationIndex_: def.DurationIndex,

		// === Filtering/Logic ===
		Attrs: SpellAttributes{
			uint32(def.Attributes),
			uint32(def.AttributesEx),
			uint32(def.AttributesExB),
			uint32(def.AttributesExC),
			uint32(def.AttributesExD),
			uint32(def.AttributesExE),
			uint32(def.AttributesExF),
			uint32(def.AttributesExG),
			uint32(def.AttributesExH),
		},
		Targets:              TargetFlags(def.Targets),
		SpellClassSet:        SpellClassSet(def.SpellClassSet),
		EquippedItemInvTypes: EquippedItemInvTypes(def.EquippedItemInvTypes),
		EquippedItemClass:    EquippedItemClass(def.EquippedItemClass),
		EquippedItemSubclass: bitmask.Bitmask32(def.EquippedItemSubclass),
		PreventionType:       PreventionType(def.PreventionType),

		// === Other ===
		TotemsID:           def.TotemsID,
		CastUI:             def.CastUI,
		RequiredAuraVision: def.RequiredAuraVision,
		MinFactionID:       def.MinFactionID,
		MinReputation:      def.MinReputation,

		// === 3.3.5a+ Fields ===
		RuneCostID:             def.RuneCostID,
		SpellMissileID:         def.SpellMissileID,
		DescriptionVariablesID: def.DescriptionVariablesID,
		CasterAuraSpell:        def.CasterAuraSpell,
		TargetAuraSpell:        def.TargetAuraSpell,
		ExcludeCasterAuraSpell: def.ExcludeCasterAuraSpell,
		ExcludeTargetAuraSpell: def.ExcludeTargetAuraSpell,
		ExcludeCasterAuraState: def.ExcludeCasterAuraState,
		ExcludeTargetAuraState: def.ExcludeTargetAuraState,
		ManaPerSecondPerLevel:  def.ManaPerSecondPerLevel,
	}

	// AuraInterruptFlags - use first element if available
	if len(def.AuraInterruptFlags) > 0 {
		s.AuraInterruptFlags = AuraInterruptFlags(def.AuraInterruptFlags[0])
	}

	// SpellClassMask - combine two int32s into uint64
	if len(def.SpellClassMask) >= 2 {
		s.SpellClassMask = NewSpellClassMask(def.SpellClassMask[0], def.SpellClassMask[1])
	} else if len(def.SpellClassMask) == 1 {
		s.SpellClassMask = SpellClassMask(uint32(def.SpellClassMask[0]))
	}

	// Reagents (fixed-size arrays)
	for i := 0; i < 8 && i < len(def.Reagent); i++ {
		s.Reagent[i] = ItemID(def.Reagent[i])
	}
	for i := 0; i < 8 && i < len(def.ReagentCount); i++ {
		s.ReagentCount[i] = def.ReagentCount[i]
	}

	// SpellVisualID (fixed-size array)
	for i := 0; i < 2 && i < len(def.SpellVisualID); i++ {
		s.SpellVisualID[i] = def.SpellVisualID[i]
	}

	// Totems
	for i := 0; i < 2 && i < len(def.Totem); i++ {
		s.Totem[i] = ItemID(def.Totem[i])
	}

	// === Effect Arrays (up to 3 effects) ===
	for i := 0; i < 3; i++ {
		if i < len(def.Effect) {
			s.Effect[i] = Effect(def.Effect[i])
		}
		if i < len(def.EffectDieSides) {
			s.EffectDieSides[i] = def.EffectDieSides[i]
		}
		if i < len(def.EffectRealPointsPerLevel) {
			s.EffectRealPointsPerLevel[i] = def.EffectRealPointsPerLevel[i]
		}
		if i < len(def.EffectBasePoints) {
			s.EffectBasePoints[i] = def.EffectBasePoints[i]
		}
		if i < len(def.EffectMechanic) {
			s.EffectMechanic[i] = def.EffectMechanic[i]
		}
		if i < len(def.EffectRadiusIndex) {
			s.EffectRadius[i] = dbcmem.GetSpellRadius(def.EffectRadiusIndex[i])
			s.EffectRadiusIndex_[i] = def.EffectRadiusIndex[i]
		}
		if i < len(def.EffectAura) {
			s.EffectAura[i] = AuraEffect(def.EffectAura[i])
		}
		if i < len(def.EffectAuraPeriod) {
			s.EffectAuraPeriod[i] = def.EffectAuraPeriod[i]
		}
		if i < len(def.EffectAmplitude) {
			s.EffectAmplitude[i] = def.EffectAmplitude[i]
		}
		if i < len(def.EffectChainTargets) {
			s.EffectChainTargets[i] = def.EffectChainTargets[i]
		}
		if i < len(def.EffectItemType) {
			s.EffectItemType[i] = ItemID(def.EffectItemType[i])
		}
		if i < len(def.EffectMiscValue) {
			s.EffectMiscValue[i] = def.EffectMiscValue[i]
		}
		if i < len(def.EffectTriggerSpell) {
			s.EffectTriggerSpell[i] = SpellID(def.EffectTriggerSpell[i])
		}
		if i < len(def.EffectPointsPerCombo) {
			s.EffectPointsPerCombo[i] = def.EffectPointsPerCombo[i]
		}
		if i < len(def.EffectBaseDice) {
			s.EffectBaseDice[i] = def.EffectBaseDice[i]
		}
		if i < len(def.EffectDicePerLevel) {
			s.EffectDicePerLevel[i] = def.EffectDicePerLevel[i]
		}
		if i < len(def.EffectChainAmplitude) {
			s.EffectChainAmplitude[i] = def.EffectChainAmplitude[i]
		}
		if i < len(def.ImplicitTargetA) {
			s.ImplicitTargetA[i] = ImplicitTarget(def.ImplicitTargetA[i])
		}
		if i < len(def.ImplicitTargetB) {
			s.ImplicitTargetB[i] = ImplicitTarget(def.ImplicitTargetB[i])
		}
	}

	return s
}
