import type { SpellDuration, SpellRange, WoWSpell } from "../types.js";

export function formatCastTime(spell: WoWSpell): string {
  // Channeled spells are detected via the attributes string.
  const isChanneled = spell.attributes.string
    .toLowerCase()
    .includes("channeled");

  if (isChanneled && spell.duration.Duration > 0) {
    const secs = spell.duration.Duration / 1000;
    if (secs >= 60) {
      const mins = Math.floor(secs / 60);
      const remainingSecs = secs % 60;
      if (remainingSecs === 0) return `${mins} min channel`;
      return `${mins} min ${remainingSecs} sec channel`;
    }
    return "Channeled";
  }

  if (spell.casting_time.Base === 0) return "Instant Cast";
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

export function formatCooldown(spell: WoWSpell): string | null {
  // recovery_time and category_recovery_time are raw DBC values in MILLISECONDS
  // (despite the Go time.Duration type, the millisecond integer is serialized
  // verbatim). The effective cooldown is the larger of the spell's own recovery
  // and its shared category recovery — many spells (e.g. Power Word: Shield)
  // store their cooldown only in the category field.
  const ms = Math.max(spell.recovery_time || 0, spell.category_recovery_time || 0);
  if (ms <= 0) return null;
  const secs = ms / 1000;
  if (secs >= 60) return `${Math.floor(secs / 60)} min cooldown`;
  return `${secs} sec cooldown`;
}
