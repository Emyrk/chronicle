// @chronicle/wow-tooltip-renderer
//
// Pure TypeScript renderer for WoW spell/item tooltips. No React, no fetch, no
// styling — data in, strings (and hex colors) out. The React tooltip components
// live in a separate package and own data fetching.

// Types
export type {
  I18nText,
  EnumValue,
  MaskValue,
  SpellIcon,
  SpellRange,
  SpellDuration,
  SpellCastTime,
  SpellRadius,
  SpellCategory,
  SpellAttributes,
  WoWSpell,
  ItemStat,
  ItemDamage,
  ItemResistance,
  ItemSpell,
  ItemSocket,
  SocketBonus,
} from "./types.js";

// Spell template resolver
export {
  resolveSpellDescription,
  extractReferencedSpellIds,
  getResolvedDescription,
  getResolvedAuraDescription,
} from "./spell/resolver.js";

// Spell scaling helpers (exposed for advanced consumers/tests)
export {
  formatDurationMs,
  getEffectiveLevel,
  getScaledValue,
  getPeriodicTotal,
  formatValue,
} from "./spell/effects.js";

export { resolveVariable } from "./spell/variables.js";
export { evaluateArithmetic } from "./spell/arithmetic.js";

// Spell formatters
export {
  formatCastTime,
  formatDuration,
  formatRange,
  formatCooldown,
} from "./spell/formatters.js";

// Spell constants
export {
  SpellDamageType,
  AttackOutcome,
  getDamageTypeLabels,
  getAttackOutcomeLabels,
} from "./spell/constants.js";

// Item formatters
export {
  formatItemStat,
  calculateDPS,
  spellTriggerText,
  type FormattedStat,
} from "./item/formatters.js";

// Item constants
export {
  BONDING_TEXT,
  INVENTORY_TYPE_TEXT,
  ITEM_CLASS_TEXT,
  STAT_DISPLAY,
  SOCKET_INFO,
  SPELL_TRIGGER_TEXT,
  SKILL_LABELS,
  type StatDisplay,
  type SocketInfo,
} from "./item/constants.js";

// Shared: localization
export {
  LOCALES,
  getEnglishText,
  getLocalizedText,
  type LocaleIndex,
} from "./shared/localization.js";

// Shared: quality
export {
  QUALITY,
  QUALITY_LABELS,
  QUALITY_COLORS,
  getQualityColor,
} from "./shared/quality.js";

// Shared: schools
export {
  SCHOOL_TEXT,
  SCHOOL_COLORS,
  SCHOOL_COLORS_BY_NAME,
} from "./shared/schools.js";
