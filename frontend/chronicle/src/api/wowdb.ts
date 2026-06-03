// WoWDB types and helpers for spell data from /api/v1/wowdb/spell/{id}.
//
// The deterministic spell-template resolver, formatters, constants, and the
// WoWSpell type now live in the pure, shareable package
// @chronicle/wow-tooltip-renderer. This module is a thin shim that re-exports
// that package and adds the few app-specific helpers that depend on Chronicle's
// runtime (tenant icon CDN, Tailwind theme classes).
//
// Prefer importing from "@chronicle/wow-tooltip-renderer" directly in new code.

import type { SpellIcon } from "@chronicle/wow-tooltip-renderer";
import { iconUrl } from "@/config/iconUrl";

// --- Re-exported types (package is the source of truth) ---
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
  LocaleIndex,
} from "@chronicle/wow-tooltip-renderer";

// --- Re-exported resolver / formatters / constants ---
export {
  // Resolver
  resolveSpellDescription,
  extractReferencedSpellIds,
  getResolvedDescription,
  getResolvedAuraDescription,
  // Localization
  LOCALES,
  getEnglishText,
  getLocalizedText,
  // Spell formatters
  formatCastTime,
  formatDuration,
  formatRange,
  formatCooldown,
  // Spell constants
  SpellDamageType,
  AttackOutcome,
  getDamageTypeLabels,
  getAttackOutcomeLabels,
} from "@chronicle/wow-tooltip-renderer";

// --- App-specific helpers (not part of the pure package) ---

/** Resolve a spell icon to a tenant-aware CDN URL. */
export function getSpellIconUrl(icon: SpellIcon): string {
  if (!icon.TextureFilename) return "";
  return iconUrl(icon.TextureFilename);
}

// School colors for styling — Tailwind classes from the central component.
// (The package exports hex values via SCHOOL_COLORS for non-Tailwind consumers.)
export { SCHOOL_TEXT_COLORS as SCHOOL_COLORS } from "@/components/SpellSchoolBadge";
