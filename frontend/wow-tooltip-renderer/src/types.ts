// Structural types for WoW spell/item tooltip rendering.
//
// These mirror Chronicle's SDK types (Chronicle is the source of truth). The
// renderer operates purely on these structures and never fetches data. Keeping
// them here lets the package be consumed by any project that can produce records
// of this shape (e.g. Chronicle Wiki). A parity test in the Chronicle frontend
// asserts these stay compatible with the live `WoWSpell` type.

// i18n.Text serializes as Record<locale, string> where "0" = enUS.
export type I18nText = Record<string, string>;

export interface EnumValue<T = number> {
  value: T;
  string: string;
}

export interface MaskValue {
  mask: number;
  string: string;
}

export interface SpellIcon {
  ID: number;
  TextureFilename: string;
}

export interface SpellRange {
  ID: number;
  RangeMin: number;
  RangeMax: number;
  Flags: number;
  Name: string;
}

export interface SpellDuration {
  ID: number;
  Duration: number; // milliseconds
  DurationPerLevel: number;
  MaxDuration: number;
}

export interface SpellCastTime {
  ID: number;
  Base: number; // milliseconds
  PerLevel: number;
  Minimum: number;
}

export interface SpellRadius {
  ID: number;
  Radius: number;
  RadiusPerLevel: number;
  RadiusMin: number;
  RadiusMax: number;
}

export interface SpellCategory {
  ID: number;
  Flags: number;
  UsesPerWeek: number;
  Name: string;
  MaxCharges: number;
  ChargeRecoveryTime: number;
  TypeMask: number;
}

export interface SpellAttributes {
  blocks: number[]; // 9 uint32 bitmasks
  string: string; // Human-readable: "Passive | Channeled1 | ..."
}

export interface WoWSpell {
  id: number;
  name: I18nText;
  subtext: I18nText; // "Rank 1", etc.
  description: I18nText;
  aura_description: I18nText;

  // Display
  spell_icon: SpellIcon;
  active_icon: SpellIcon;

  // Level
  spell_level: number;
  base_level: number;
  max_level: number;

  // Category
  category: SpellCategory;

  // School & Class
  school: EnumValue;
  spell_class_set: EnumValue;
  spell_class_mask: number;

  // Resource cost
  power_type: EnumValue;
  mana_cost: number;
  mana_cost_pct: number;
  mana_cost_per_level: number;
  mana_per_second: number;
  reagent: number[];
  reagent_count: number[];

  // Timing
  casting_time: SpellCastTime;
  range: SpellRange;
  duration: SpellDuration;
  recovery_time: number; // nanoseconds (cooldown)
  start_recovery_time: number; // GCD in nanoseconds
  start_recovery_category: number;
  category_recovery_time: number; // shared category cooldown in nanoseconds

  // Mechanics
  mechanic: EnumValue;
  dispel_type: EnumValue;
  prevention_type: EnumValue;
  defense_type: EnumValue;
  caster_aura_state: EnumValue;
  target_aura_state: EnumValue;
  interrupt_flags: MaskValue;
  aura_interrupt_flags: MaskValue;

  // Effects (3 slots)
  effect: EnumValue[];
  effect_aura: EnumValue[];
  effect_base_points: number[];
  effect_die_sides: number[];
  effect_base_dice: number[];
  effect_dice_per_level: number[];
  effect_real_points_per_level: number[];
  effect_aura_period: number[]; // milliseconds between ticks
  effect_amplitude: number[];
  effect_chain_amplitude: number[];
  effect_chain_targets: number[];
  effect_trigger_spell: number[];
  effect_item_type: number[];
  effect_misc_value: number[];
  effect_mechanic: number[];
  effect_points_per_combo: number[];
  effect_radius: SpellRadius[];
  implicit_target_a: EnumValue[];
  implicit_target_b: EnumValue[];

  // Proc
  proc_chance: number;
  proc_charges: number;
  proc_type_mask: MaskValue;
  proc_flags: MaskValue;

  // Targeting
  targets: MaskValue;
  max_targets: number;
  max_target_level: number;
  target_creature_type: MaskValue;

  // Attributes
  attributes: SpellAttributes;

  // Equipped item requirements
  equipped_item_class: EnumValue;
  equipped_item_subclass: number;
  equipped_item_inv_types: MaskValue;

  // Other
  speed: number;
  spell_priority: number;
  stance_bar_order: number;
  cumulative_aura: number;
  modal_next_spell: number;
  requires_spell_focus: { ID: number; Name: string };
  totems_id: number;
  totem: number[];
  cast_ui: number;
  required_aura_vision: number;
  min_faction_id: number;
  min_reputation: number;
  spell_visual_id: number[];

  // Chronicle metadata
  damage_type: number;
  attack_outcome: number;
}

// === Item structural types (mirror Chronicle SDK) ===

export interface ItemStat {
  readonly type: number;
  readonly value: number;
}

export interface ItemDamage {
  readonly min: number;
  readonly max: number;
  readonly school: number;
}

export interface ItemResistance {
  readonly school: number;
  readonly value: number;
}

export interface ItemSpell {
  readonly spell_id: number;
  readonly trigger: number; // 0=Use, 1=Equip, 2=Chance on hit
  readonly charges?: number;
}

export interface ItemSocket {
  readonly color: number; // 1=Meta, 2=Red, 4=Yellow, 8=Blue
}

export interface SocketBonus {
  readonly spell_id: number;
}
