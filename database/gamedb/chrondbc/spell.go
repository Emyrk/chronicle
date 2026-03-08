package chrondbc

import (
	"time"

	"github.com/Emyrk/chronicle/internal/bitmask"
	"github.com/Gophercraft/core/i18n"
)

const (
	SpellIDAutoAttack SpellID = 6603
)

// SpellRef is a minimal reference to a spell for JSON APIs
type SpellRef struct {
	ID   int32  `json:"id"`
	Name string `json:"name"`
}

type Spell struct {
	// === Core Identification ===
	ID                   SpellID   `json:"id"`               // Unique spell identifier
	Name_lang            i18n.Text `json:"name"`             // Localized spell name (e.g., "Fireball")
	NameSubtext_lang     i18n.Text `json:"subtext"`          // Rank or subtext (e.g., "Rank 1", "Passive", "Racial")
	Description_lang     i18n.Text `json:"description"`      // Tooltip description with placeholders like $d (duration), $s1 (effect 1 value)
	AuraDescription_lang i18n.Text `json:"aura_description"` // Buff/debuff tooltip shown when aura is active

	// === Display ===
	SpellIconID  IconID `json:"spell_icon"`  // Icon shown in spellbook and action bars (→ SpellIcon.dbc)
	ActiveIconID IconID `json:"active_icon"` // Icon shown while spell is active/channeling (often 0)

	// === Level Requirements ===
	MaxLevel       int32           `json:"max_level"`        // Level cap for scaling (0 = no cap)
	BaseLevel      int32           `json:"base_level"`       // Minimum player level to use this spell
	SpellLevel     int32           `json:"spell_level"`      // Spell's own level for scaling calculations
	Category       SpellCategoryID `json:"category"`         // Spell category for shared cooldowns (→ SpellCategory.dbc)
	MaxTargetLevel int32           `json:"max_target_level"` // Maximum target level (0 = no limit, used for CC diminishing)

	// === Behavior ===
	School             School             `json:"school"`           // Magic school: physical, holy, fire, nature, frost, shadow, arcane
	SpellPriority      int32              `json:"spell_priority"`   // AI priority for NPC spell selection
	StanceBarOrder     int32              `json:"stance_bar_order"` // Position on stance/shapeshift action bar
	ProcTypeMask       bitmask.Bitmask32  `json:"proc_type_mask"`   // Events that can trigger this spell (on hit, on crit, on kill, etc.)
	ProcFlags          ProcFlags          `json:"proc_flags"`       // Additional proc configuration
	ProcChance         int32              `json:"proc_chance"`      // Percent chance to proc (>100 means server-side calculation)
	ProcCharges        int32              `json:"proc_charges"`     // Number of times proc can trigger before aura fades (0 = unlimited)
	Speed              float32            `json:"speed"`            // Projectile travel speed in yards/sec (0 = instant)
	DispelType         DispelType         `json:"dispel_type"`      // Dispel category: 0=none, 1=magic, 2=curse, 3=disease, 4=poison
	AuraInterruptFlags AuraInterruptFlags `json:"aura_interrupt_flags"`
	ModalNextSpell     int32              `json:"modal_next_spell"`  // The "Modal" suggests it's about spells that share a button slot but swap based on game state.
	InterruptFlags     InterruptFlags     `json:"interrupt_flags"`   // what can interrupt a spell while casting (different from AuraInterruptFlags which is for buffs).
	CumulativeAura     int32              `json:"cumulative_aura"`   // Max charges I think?
	Mechanic           Mechanic           `json:"mechanic"`          // Combat mechanic: stun, root, silence, etc. (for immunity checks)
	DefenseType        DefenseType        `json:"defense_type"`      // How the target can defend against this spell
	CasterAuraState    AuraState          `json:"caster_aura_state"` // what state the target must be in for the spell to be usable.
	TargetAuraState    AuraState          `json:"target_aura_state"`
	MaxTargets         int32              `json:"max_targets"`
	TargetCreatureType TargetCreatureType `json:"target_creature_type"`
	RequiresSpellFocus SpellFocusObject   `json:"requires_spell_focus"` // The game checks if there's a matching game object within range (usually ~5 yards) before allowing the cast.

	// === Resource Cost ===
	PowerType        Power     `json:"power_type"`          // Resource type: 0=mana, 1=rage, 2=focus, 3=energy
	ManaCost         int32     `json:"mana_cost"`           // Flat resource cost
	ManaCostPct      int32     `json:"mana_cost_pct"`       // Cost as percentage of base mana
	ManaCostPerLevel int32     `json:"mana_cost_per_level"` // Additional cost per caster level
	ManaPerSecond    int32     `json:"mana_per_second"`     // Resource drain per second while channeling
	Reagent          [8]ItemID `json:"reagent"`             // Required consumable item IDs (up to 8)
	ReagentCount     [8]int32  `json:"reagent_count"`       // Quantity of each reagent consumed per cast

	// === Timing ===
	CastingTimeIndex      CastingTimeID `json:"casting_time"`            // Cast time lookup (→ SpellCastTimes.dbc)
	RecoveryTime          time.Duration `json:"recovery_time"`           // Spell cooldown in milliseconds
	StartRecoveryCategory int32         `json:"start_recovery_category"` // controls which Global Cooldown (GCD) group a spell belongs to.
	StartRecoveryTime     time.Duration `json:"start_recovery_time"`     // GCD in ms
	CategoryRecoveryTime  time.Duration `json:"category_recovery_time"`  // Shared cooldown in milliseconds for spells in the same category
	RangeIndex            RangeID       `json:"range"`                   // Min/max range lookup (→ SpellRange.dbc)
	DurationIndex         DurationID    `json:"duration"`                // Buff/debuff duration lookup (→ SpellDuration.dbc)

	// === Filtering/Logic ===
	Attrs                SpellAttributes      `json:"attributes"`              // 9 attribute flags controlling spell behavior (can't crit, channeled, etc.)
	Targets              TargetFlags          `json:"targets"`                 // Valid target types (self, party, enemy, etc.)
	SpellClassSet        SpellClassSet        `json:"spell_class_set"`         // What class can use the spell
	SpellClassMask       SpellClassMask       `json:"spell_class_mask"`        // Every spell has a 96 bit mask to identify it (for talents)
	EquippedItemInvTypes EquippedItemInvTypes `json:"equipped_item_inv_types"` // bitmask of inventory slot types required to use the spell.
	EquippedItemClass    EquippedItemClass    `json:"equipped_item_class"`     // Item required to use the spell
	EquippedItemSubclass bitmask.Bitmask32    `json:"equipped_item_subclass"`  // Subclass is either ArmorSubclass or WeaponSubclass, depending on EquippedItemClass
	PreventionType       PreventionType       `json:"prevention_type"`

	// === Effect Data (up to 3 effects per spell, index 0-2) ===
	Effect                   [3]Effect         `json:"effect"`                       // Effect type: damage, heal, apply aura, summon, etc.
	EffectDieSides           [3]int32          `json:"effect_die_sides"`             // Random range: value = BasePoints + rand(1, DieSides)
	EffectRealPointsPerLevel [3]float32        `json:"effect_real_points_per_level"` // Bonus points per caster level (for scaling)
	EffectBasePoints         [3]int32          `json:"effect_base_points"`           // Base value for effect calculations
	EffectMechanic           [3]int32          `json:"effect_mechanic"`              // Combat mechanic: stun, root, bleed, etc. (for immunity checks)
	EffectRadiusIndex        [3]SpellRadiusID  `json:"effect_radius"`                // AoE radius lookup (→ SpellRadius.dbc)
	EffectAura               [3]AuraEffect     `json:"effect_aura"`                  // Aura type if Effect is ApplyAura (mod stat, periodic damage, etc.)
	EffectAuraPeriod         [3]int32          `json:"effect_aura_period"`           // Tick interval in ms for periodic effects (e.g., 3000 = 3 sec)
	EffectAmplitude          [3]float32        `json:"effect_amplitude"`             // Amplitude modifier for periodic effects
	EffectChainTargets       [3]int32          `json:"effect_chain_targets"`         // Number of chain/bounce targets (Chain Lightning, etc.)
	EffectItemType           [3]ItemID         `json:"effect_item_type"`             // Item created/affected by effect (Conjure Water creates item 5350)
	EffectMiscValue          [3]int32          `json:"effect_misc_value"`            // Context-dependent: stat type, power type, creature ID, etc.
	EffectTriggerSpell       [3]SpellID        `json:"effect_trigger_spell"`         // Spell triggered by this effect (procs, chain casts)
	EffectPointsPerCombo     [3]float32        `json:"effect_points_per_combo"`      // Bonus points per combo point (rogue/druid finishers)
	EffectBaseDice           [3]int32          `json:"effect_base_dice"`             // Base dice count for damage variance
	EffectDicePerLevel       [3]int32          `json:"effect_dice_per_level"`        // Additional dice per caster level
	EffectChainAmplitude     [3]float32        `json:"effect_chain_amplitude"`       // Damage multiplier per chain bounce (e.g., 0.7 = 30% reduction)
	ImplicitTargetA          [3]ImplicitTarget `json:"implicit_target_a"`            // Primary targeting for each effect: who/what the effect affects (self, enemy, ally, area, etc.)
	ImplicitTargetB          [3]ImplicitTarget `json:"implicit_target_b"`            // Secondary targeting for each effect: typically the location/destination (used for movement, AoE placement, etc.)

	// === Totem Requirements (Shaman) ===
	TotemsID int32     `json:"totems_id"` // Totem category/type ID
	Totem    [2]ItemID `json:"totem"`     // Required totem tool item IDs (not consumed, just must be in inventory)

	// === Other ===
	CastUI             int32    `json:"cast_ui"`
	RequiredAuraVision int32    `json:"required_aura_vision"`
	MinFactionID       int32    `json:"min_faction_id"`
	MinReputation      int32    `json:"min_reputation"`
	SpellVisualID      [2]int32 `json:"spell_visual_id"`

	// No value
	//RequiredAreaID          int32
	//ShapeshiftMask          []int32
	//ShapeshiftExclude       []int32
	//ChannelInterruptFlags   []int32
	//FacingCasterFlags       int32
	//ScalingID               int32     // Always 0
	//SchoolMask              int32     // Always 0
	//CategoriesID            int32     // Always 0
	//CooldownsID             int32     // Always 0
	//Difficulty              int32     // Used for mythic/20man/heroic
	//ShapeshiftID            int32     // Always 0
	//ReagentsID              int32     // Always 0
	//ManaPerSecondPerLevel   int32     // Always 0
	//EffectSpellClassMaskA   []int32   // Always nil
	//EffectSpellClassMaskB   []int32   // Always nil
	//EffectSpellClassMaskC   []int32   // Always nil
	//EffectBonusCoefficient  []float32 // always nil
	//RequiredTotemCategoryID []int32   // Always nil
	//EffectMiscValueB        []int32   // Always nil
	//EffectRadiusIndexB      []int32   // Always nil
	//RuneCostID              int32     // Always 0
	//SpellMissileID          int32     // Always 0
	//DescriptionVariablesID  int32     // Always 0
	//AuraOptionsID           int32
	//AuraRestrictionsID      int32
	//CastingRequirementsID   int32
	//ClassOptionsID          int32
	//EquippedItemsID         int32
	//InterruptsID            int32
	//LevelsID                int32
	//TargetRestrictionsID    int32
	//RequiredProjectID       int32
	//MiscID                  int32
	//CasterAuraSpell         int32
	//TargetAuraSpell         int32
	//ExcludeCasterAuraSpell  int32
	//ExcludeTargetAuraSpell  int32
	//PowerDisplayID          int32
	//ManaPerSecondPerLevel   int32
	//ExcludeCasterAuraState  int32
	//ExcludeTargetAuraState  int32
}

func (s Spell) String() string {
	return s.Name_lang.String()
}

// Name returns the spell name as a string (convenience for English locale).
func (s Spell) Name() string {
	return s.Name_lang.String()
}

// Subtext returns the subtext (rank) as a string.
func (s Spell) Subtext() string {
	return s.NameSubtext_lang.String()
}

// Description returns the description as a string.
func (s Spell) Description() string {
	return s.Description_lang.String()
}

// AuraDescription returns the aura description as a string.
func (s Spell) AuraDescription() string {
	return s.AuraDescription_lang.String()
}

func (s Spell) Affects(other Spell) bool {
	for i, effect := range s.EffectAura {
		if effect == AuraEffectModDamagePercentTaken {
			mask := s.EffectMiscValue[i]
			if School(mask)&other.School != 0 {
				return true
			}
		}
	}
	return false
}

type SpellDamageType bitmask.Bitmask32

func (s SpellDamageType) Has(b SpellDamageType) bool {
	return bitmask.Bitmask32(s).Has(bitmask.Bitmask32(b))
}

const (
	SpellDamageUnknown         SpellDamageType = 0x00
	SpellDamageDirect          SpellDamageType = 0x01
	SpellDamagePeriodic        SpellDamageType = 0x02
	SpellDamagePeriodicTrigger SpellDamageType = 0x04
	// TODO: Trigger?
)

// SpellDamageType is chronicle's category for the spell. It's essentially an
// analysis of the spell's effects to determine how it functions in combat, which
// is useful for filtering and logic.
func (s Spell) SpellDamageType() SpellDamageType {
	var base SpellDamageType

	for i, eff := range s.Effect {
		switch eff {
		case EffectSchoolDMG,
			EffectPowerBurn,
			EffectEnergize,
			EffectHealthLeech,
			EffectDamageFromMaxHealthPCT,
			EffectHeal:
			base |= SpellDamageDirect
		case EffectApplyAura, EffectPersistentAA:
			switch s.EffectAura[i] {
			case AuraEffectPeriodicDamage,
				AuraEffectPeriodicHeal,
				AuraEffectPeriodicEnergize,
				AuraEffectPeriodicLeech,
				AuraEffectPeriodicHealthFunnel,
				AuraEffectPeriodicManaLeech,
				AuraEffectPeriodicDamagePercent,
				AuraEffectPowerBurn:
				base |= SpellDamagePeriodic
			case AuraEffectPeriodicTriggerSpell:
				// Spells like arcane missiles
				base |= SpellDamagePeriodicTrigger
			}
		default:
		}
	}

	return base
}

// AttackOutcome is a bitmask of hit table results possible for a spell.
type AttackOutcome bitmask.Bitmask32

func (a AttackOutcome) Has(b AttackOutcome) bool {
	return bitmask.Bitmask32(a).Has(bitmask.Bitmask32(b))
}

const (
	AttackOutcomeNone     AttackOutcome = 0x00
	AttackOutcomeMiss     AttackOutcome = 0x01
	AttackOutcomeDodge    AttackOutcome = 0x02
	AttackOutcomeParry    AttackOutcome = 0x04
	AttackOutcomeBlock    AttackOutcome = 0x08
	AttackOutcomeResist   AttackOutcome = 0x10 // Full resist
	AttackOutcomeHit      AttackOutcome = 0x20
	AttackOutcomeCrit     AttackOutcome = 0x40
	AttackOutcomeGlancing AttackOutcome = 0x80
	AttackOutcomeCrushing AttackOutcome = 0x100
)

// AttackOutcome returns a bitmask of hit table outcomes possible for this spell.
func (s Spell) AttackOutcome() AttackOutcome {
	if s.ID == SpellIDAutoAttack {
		return AttackOutcomeMiss | AttackOutcomeDodge | AttackOutcomeParry |
			AttackOutcomeHit |
			AttackOutcomeBlock |
			AttackOutcomeGlancing | AttackOutcomeCrushing | AttackOutcomeCrit
	}

	result := AttackOutcomeMiss | AttackOutcomeHit

	switch s.DefenseType {
	case DefenseTypeMelee:
		result |= AttackOutcomeMiss | AttackOutcomeHit
		if !s.Attrs.Has(Attr_NoActiveDefense) {
			result |= AttackOutcomeDodge | AttackOutcomeParry | AttackOutcomeBlock
		}
		if !s.Attrs.Has(AttrEx2_CantCrit) {
			result |= AttackOutcomeCrit
		}

	case DefenseTypeRanged:
		result |= AttackOutcomeMiss | AttackOutcomeHit
		if !s.Attrs.Has(Attr_NoActiveDefense) {
			result |= AttackOutcomeDodge
		}
		if !s.Attrs.Has(AttrEx2_CantCrit) {
			result |= AttackOutcomeCrit
		}

	case DefenseTypeMagic:
		result |= AttackOutcomeHit
		if !s.Attrs.Has(AttrEx4_IgnoreResistances) {
			result |= AttackOutcomeResist
		}
		if !s.Attrs.Has(AttrEx2_CantCrit) {
			result |= AttackOutcomeCrit
		}
	}

	return result
}
