// WoWDB types for spell data from /api/v1/wowdb/spell/{id}

// i18n.Text serializes as Record<locale, string> where "0" = enUS
export type I18nText = Record<string, string>;

// Common pattern for enum fields with custom JSON marshaling
export interface EnumValue<T = number> {
  value: T;
  string: string;
}

// Bitmask fields
export interface MaskValue {
  mask: number;
  string: string;
}

// Embedded DBC lookups
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

// Spell attributes with both raw blocks and human-readable string
export interface SpellAttributes {
  blocks: number[]; // 9 uint32 bitmasks
  string: string;   // Human-readable: "Passive | Channeled1 | ..."
}

export interface WoWSpell {
  id: number;
  name: I18nText;
  subtext: I18nText; // "Rank 1", etc.
  description: I18nText;
  aura_description: I18nText;

  // Display - already includes TextureFilename!
  spell_icon: SpellIcon;
  active_icon: SpellIcon;

  // Level
  spell_level: number;
  base_level: number;
  max_level: number;

  // Category
  category: SpellCategory;

  // School & Class
  school: EnumValue; // {value: 1, string: "Holy"}
  spell_class_set: EnumValue; // {value: 6, string: "Priest"}
  spell_class_mask: number;

  // Resource cost
  power_type: EnumValue; // {value: 0, string: "Mana"}
  mana_cost: number;
  mana_cost_pct: number;
  mana_cost_per_level: number;
  mana_per_second: number;
  reagent: number[];
  reagent_count: number[];

  // Timing - embedded DBC lookups
  casting_time: SpellCastTime;
  range: SpellRange;
  duration: SpellDuration;
  recovery_time: number; // nanoseconds (cooldown)
  start_recovery_time: number; // GCD in nanoseconds
  start_recovery_category: number;
  category_recovery_time: number;

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
  effect: EnumValue[]; // [{value: 6, string: "ApplyAura"}, ...]
  effect_aura: EnumValue[]; // [{value: 8, string: "PeriodicHeal"}, ...]
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

  // Attributes (9 uint32 bitmasks with human-readable string)
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
  damage_type: number; // Bitmask: 0x01=Direct, 0x02=Periodic, 0x04=PeriodicTrigger
  attack_outcome: number; // AttackOutcome bitmask of possible hit table results
}

// SpellDamageType bitmask constants
export const SpellDamageType = {
  Unknown: 0x00,
  Direct: 0x01,
  Periodic: 0x02,
  PeriodicTrigger: 0x04,
} as const;

export function getDamageTypeLabels(damageType: number): string[] {
  const labels: string[] = [];
  if (damageType & SpellDamageType.Direct) labels.push("Direct");
  if (damageType & SpellDamageType.Periodic) labels.push("Periodic");
  if (damageType & SpellDamageType.PeriodicTrigger) labels.push("Periodic Trigger");
  return labels;
}

// AttackOutcome bitmask constants (mirrors chrondbc.AttackOutcome)
export const AttackOutcome = {
  None: 0x00,
  Miss: 0x01,
  Dodge: 0x02,
  Parry: 0x04,
  Block: 0x08,
  Resist: 0x10,
  Hit: 0x20,
  Crit: 0x40,
  Glancing: 0x80,
  Crushing: 0x100,
} as const;

export function getAttackOutcomeLabels(outcome: number): string[] {
  const labels: string[] = [];
  if (outcome & AttackOutcome.Miss) labels.push("Miss");
  if (outcome & AttackOutcome.Dodge) labels.push("Dodge");
  if (outcome & AttackOutcome.Parry) labels.push("Parry");
  if (outcome & AttackOutcome.Block) labels.push("Block");
  if (outcome & AttackOutcome.Resist) labels.push("Resist");
  if (outcome & AttackOutcome.Hit) labels.push("Hit");
  if (outcome & AttackOutcome.Crit) labels.push("Crit");
  if (outcome & AttackOutcome.Glancing) labels.push("Glancing");
  if (outcome & AttackOutcome.Crushing) labels.push("Crushing");
  return labels;
}

// === Locales ===

export const LOCALES = [
  { index: "0", code: "enUS", label: "English" },
  { index: "1", code: "koKR", label: "한국어" },
  { index: "2", code: "frFR", label: "Français" },
  { index: "3", code: "deDE", label: "Deutsch" },
  { index: "4", code: "zhCN", label: "简体中文" },
  { index: "5", code: "zhTW", label: "繁體中文" },
  { index: "6", code: "esES", label: "Español (EU)" },
  { index: "7", code: "esMX", label: "Español (MX)" },
  { index: "8", code: "ruRU", label: "Русский" },
  { index: "9", code: "jaJP", label: "日本語" },
  { index: "10", code: "ptPT", label: "Português" },
  { index: "11", code: "itIT", label: "Italiano" },
] as const;

export type LocaleIndex = (typeof LOCALES)[number]["index"];

// === Helpers ===

export function getEnglishText(text: I18nText | undefined): string {
  if (!text) return "";
  return text["0"] || "";
}

export function getLocalizedText(
  text: I18nText | undefined,
  locale: LocaleIndex
): string {
  if (!text) return "";
  return text[locale] || text["0"] || "";
}

export function getSpellIconUrl(icon: SpellIcon): string {
  if (!icon.TextureFilename) return "";
  return `https://icons.chronicleclassic.com/${icon.TextureFilename.toLowerCase()}.webp`;
}

export function formatCastTime(spell: WoWSpell): string {
  // Check if spell is channeled (attributes contain "Channeled")
  const isChanneled = spell.attributes.string.toLowerCase().includes("channeled");
  
  if (isChanneled && spell.duration.Duration > 0) {
    const secs = spell.duration.Duration / 1000;
    if (secs >= 60) {
      const mins = Math.floor(secs / 60);
      const remainingSecs = secs % 60;
      if (remainingSecs === 0) return `${mins} min channel`;
      return `${mins} min ${remainingSecs} sec channel`;
    }
    return `${secs} sec channel`;
  }
  
  if (spell.casting_time.Base === 0) return "Instant";
  return `${(spell.casting_time.Base / 1000).toFixed(1)} sec cast`;
}

export function formatDuration(duration: SpellDuration): string {
  if (duration.Duration === 0) return "Instant";
  const secs = duration.Duration / 1000;
  if (secs >= 60) return `${Math.floor(secs / 60)} min`;
  return `${secs} sec`;
}

export function formatRange(range: SpellRange): string {
  if (range.RangeMax === 0) return "Self";
  return `${range.RangeMax} yd`;
}

export function formatCooldown(recoveryTimeNs: number): string | null {
  if (recoveryTimeNs === 0) return null;
  const secs = recoveryTimeNs / 1_000_000_000;
  if (secs >= 60) return `${Math.floor(secs / 60)} min cooldown`;
  return `${secs} sec cooldown`;
}

// School colors for styling (by school name)
// Uses CSS variables defined in index.css under @theme inline
// Keyed by school string name since API numeric values vary
export const SCHOOL_COLORS: Record<string, string> = {
  Physical: "text-school-physical",
  Holy: "text-school-holy",
  Fire: "text-school-fire",
  Nature: "text-school-nature",
  Frost: "text-school-frost",
  Shadow: "text-school-shadow",
  Arcane: "text-school-arcane",
};

// === Spell Description Template Resolver ===
// WoW spell descriptions contain template variables like $s1, $o1, $d, $t1
// that need to be resolved using the spell's effect data.

/**
 * Format a duration in milliseconds to a human-readable string.
 * Used for $d variable.
 */
function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0 sec";
  const seconds = ms / 1000;
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (mins === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
    return `${hours} hour${hours !== 1 ? "s" : ""} ${mins} min`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (secs === 0) return `${mins} min`;
    return `${mins} min ${secs} sec`;
  }
  // Show decimal for short durations
  if (seconds < 10 && seconds !== Math.floor(seconds)) {
    return `${seconds.toFixed(1)} sec`;
  }
  return `${Math.floor(seconds)} sec`;
}

/**
 * Get the effect value for a given effect slot.
 * $s1, $s2, $s3 = effect_base_points[N] + effect_die_sides[N]
 */
function getEffectValue(spell: WoWSpell, index: number): number {
  if (index < 0 || index >= 3) return 0;
  const basePoints = spell.effect_base_points[index] ?? 0;
  const dieSides = spell.effect_die_sides[index] ?? 0;
  // The actual value is base_points + 1 (when die_sides = 1) or base_points + die_sides
  return basePoints + Math.max(dieSides, 1);
}

/**
 * Get the total periodic value over the spell's duration.
 * $o1, $o2, $o3 = effect_value * (duration / period)
 */
function getTotalPeriodicValue(spell: WoWSpell, index: number): number {
  if (index < 0 || index >= 3) return 0;
  const effectValue = getEffectValue(spell, index);
  const period = spell.effect_aura_period[index] ?? 0;
  const duration = spell.duration.Duration ?? 0;
  if (period <= 0 || duration <= 0) return effectValue;
  const ticks = Math.floor(duration / period);
  return effectValue * ticks;
}

/**
 * Resolve a single template variable.
 */
function resolveVariable(spell: WoWSpell, variable: string): string {
  // Match patterns like $s1, $o1, $d, $t1, $a1, $e1, $m1, $x1, $n, $h, etc.
  
  // Duration: $d
  if (variable === "$d") {
    return formatDurationMs(spell.duration.Duration);
  }

  // Match indexed variables: $X# where X is a letter and # is 1, 2, or 3
  const indexedMatch = variable.match(/^\$([a-zA-Z])(\d)$/);
  if (indexedMatch) {
    const type = indexedMatch[1].toLowerCase();
    const index = parseInt(indexedMatch[2], 10) - 1; // Convert 1-indexed to 0-indexed

    switch (type) {
      case "s": // Effect value (base + die)
      case "m": // Modified effect value (same as $s for our purposes)
        return String(Math.abs(getEffectValue(spell, index)));

      case "o": // Total over duration
        return String(Math.abs(getTotalPeriodicValue(spell, index)));

      case "t": // Tick interval in seconds
        const period = spell.effect_aura_period[index] ?? 0;
        return period > 0 ? String(period / 1000) : "0";

      case "a": // AOE radius
        const radius = spell.effect_radius[index];
        return radius ? String(radius.Radius) : "0";

      case "e": // Effect amplitude/proc value
        return String(spell.effect_amplitude[index] ?? 0);

      case "x": // Chain targets
        return String(spell.effect_chain_targets[index] ?? 0);

      case "b": // Points per combo point
        return String(spell.effect_points_per_combo[index] ?? 0);

      case "f": // Max stacks (not always per-effect, but sometimes used)
        return String(spell.cumulative_aura || 0);
    }
  }

  // Non-indexed variables
  switch (variable) {
    case "$n": // Proc charges / stacks
      return String(spell.proc_charges || 1);

    case "$h": // Proc chance
      return String(spell.proc_chance || 0);

    case "$r": // Range
      return String(spell.range.RangeMax || 0);

    case "$u": // Max stacks / cumulative aura
      return String(spell.cumulative_aura || 0);

    case "$v": // Max target level
      return String(spell.max_target_level || 0);

    case "$z": // Home location (runtime, not available)
      return "[Home]";

    case "$c": // Caster (runtime)
      return "the caster";

    // Note: $l is NOT "level" — it's handled as pluralization ($lsingular:plural;)
    // in resolveSpellDescription() as a post-pass. If we get here, return
    // the original variable so the pluralization regex can pick it up.
    case "$l":
      return variable;

    default:
      // Return the original variable if we can't resolve it
      return variable;
  }
}

/**
 * Extract all referenced spell IDs from a template string.
 * Matches patterns like $3137s1 (spell ID 3137, variable s1).
 */
export function extractReferencedSpellIds(template: string): number[] {
  if (!template) return [];
  
  const ids = new Set<number>();
  const regex = /\$(\d+)([a-zA-Z])(\d)?/g;
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    ids.add(parseInt(match[1], 10));
  }
  
  return Array.from(ids);
}

/**
 * Resolve all template variables in a spell description string.
 *
 * Supported variables:
 * - $s1, $s2, $s3: Effect value (base_points + die_sides)
 * - $o1, $o2, $o3: Total periodic value over duration
 * - $d: Spell duration
 * - $t1, $t2, $t3: Tick interval in seconds
 * - $a1, $a2, $a3: AOE radius
 * - $r: Spell range
 * - $n: Proc charges
 * - $h: Proc chance
 * - $x1, $x2, $x3: Chain targets
 * - $b1, $b2, $b3: Points per combo point
 * - $NNNNsX: Cross-spell reference (e.g., $3137s1 = spell 3137's s1 value)
 * - $*N;VAR: Multiply variable by N (e.g., $*8;s1 = s1 value * 8)
 * - $/N;VAR: Divide variable by N (e.g., $/10;s1 = s1 value / 10)
 * - $lsingular:plural;: Pluralization (uses preceding number, 1 = singular)
 * 
 * @param spell The spell being described
 * @param template The template string with variables
 * @param referencedSpells Optional map of spell ID -> WoWSpell for cross-spell references
 */
export function resolveSpellDescription(
  spell: WoWSpell,
  template: string,
  referencedSpells?: Map<number, WoWSpell>
): string {
  if (!template) return "";

  let result = template;

  // Pre-pass: arithmetic — $*N;VAR (multiply) and $/N;VAR (divide)
  // Must run before variable resolution so the inner variable gets resolved
  result = result.replace(/\$\*(\d+);([a-zA-Z])(\d)?/g, (_match, multiplier, type, index) => {
    const variable = `$${type}${index || ""}`;
    const resolved = resolveVariable(spell, variable);
    const num = Number(resolved);
    if (!isNaN(num)) {
      return String(Math.round(num * parseInt(multiplier)));
    }
    return _match;
  });
  result = result.replace(/\$\/(\d+);([a-zA-Z])(\d)?/g, (_match, divisor, type, index) => {
    const variable = `$${type}${index || ""}`;
    const resolved = resolveVariable(spell, variable);
    const num = Number(resolved);
    const div = parseInt(divisor);
    if (!isNaN(num) && div !== 0) {
      return String(Math.round(num / div));
    }
    return _match;
  });

  // First pass: resolve cross-spell references like $3137s1
  result = result.replace(/(-?)\$(\d+)([a-zA-Z])(\d)?/g, (_match, negative, spellId, type, index) => {
    const refSpell = referencedSpells?.get(parseInt(spellId, 10));
    if (!refSpell) {
      // Can't resolve without the referenced spell data - leave placeholder
      return _match;
    }
    
    const variable = `$${type}${index || ""}`;
    const resolved = resolveVariable(refSpell, variable);
    
    if (negative === "-" && !isNaN(Number(resolved))) {
      return String(-Math.abs(Number(resolved)));
    }
    
    return resolved;
  });

  // Second pass: resolve local variables like $s1, $d
  result = result.replace(/(-?)\$([a-zA-Z])(\d)?/g, (_match, negative, type, index) => {
    const variable = `$${type}${index || ""}`;
    const resolved = resolveVariable(spell, variable);
    
    // If the original had a negative sign and we resolved to a number, apply it
    if (negative === "-" && !isNaN(Number(resolved))) {
      return String(-Math.abs(Number(resolved)));
    }
    
    return resolved;
  });

  // Third pass: pluralization — $lsingular:plural;
  // WoW's $l uses the most recent resolved number to pick singular vs plural.
  // E.g., "1 extra $lattack:attacks;" → "1 extra attack"
  result = result.replace(/\$l([^:]+):([^;]+);/g, (_match, singular, plural, offset) => {
    // Look backwards from $l for the most recent number
    const before = result.substring(0, offset);
    const numMatch = before.match(/(\d+)[^\d]*$/);
    if (numMatch) {
      return parseInt(numMatch[1]) === 1 ? singular : plural;
    }
    return plural; // default to plural if no number found
  });
  
  return result;
}

/**
 * Get the resolved English description for a spell.
 */
export function getResolvedDescription(spell: WoWSpell): string {
  const template = getEnglishText(spell.description);
  return resolveSpellDescription(spell, template);
}

/**
 * Get the resolved English aura description for a spell.
 */
export function getResolvedAuraDescription(spell: WoWSpell): string {
  const template = getEnglishText(spell.aura_description);
  return resolveSpellDescription(spell, template);
}

