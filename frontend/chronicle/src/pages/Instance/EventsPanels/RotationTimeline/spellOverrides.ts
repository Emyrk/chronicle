/**
 * Manual spell mutations for the rotation timeline: places where the rules
 * derived from spell data are overridden by hand. Each entry shows in the
 * rules view (Shift+click) as yellow cells with its note.
 */

export interface SpellOverride {
  /** Stable key for React and the rules view. */
  id: string;
  /** Spell names (every rank) this applies to. */
  names?: string[];
  /** Spell IDs this applies to. */
  spellIds?: number[];
  /** Only when the log's flavor tags include all of these (e.g. "nightmare-of-ursol"). */
  flavor?: string[];
  /**
   * Draw as a cooldown: a ringed square on the rail that tints the lane for its
   * duration. Without a durationMs, the spell data's duration is used; when the
   * spell only appears as a buff, each buff's real duration is. durationMs: 0
   * keeps the marker but drops the tint.
   */
  showAsCooldown?: { durationMs?: number };
  /**
   * Never draw this spell's casts: the log writes it next to the spell that
   * matters (e.g. a talent trigger beside the effect it applies).
   */
  hide?: boolean;
  /** Color for the cooldown's ring, strip and lane tint (any CSS color). */
  color?: string;
  /** Why the override exists. */
  note: string;
}

export const SPELL_OVERRIDES: SpellOverride[] = [
  {
    id: "nature-eclipse",
    names: ["Nature Eclipse"],
    spellIds: [51442],
    flavor: ["nightmare-of-ursol"],
    showAsCooldown: {},
    color: "var(--color-school-nature)",
    note: "Eclipse procs change a balance druid's damage enough to show their duration like a cooldown.",
  },
  {
    id: "arcane-eclipse",
    names: ["Arcane Eclipse"],
    spellIds: [51443],
    flavor: ["nightmare-of-ursol"],
    showAsCooldown: {},
    color: "#3b82f6", // blue-500; the arcane school color is pink
    note: "Eclipse procs change a balance druid's damage enough to show their duration like a cooldown.",
  },
  {
    id: "blood-tap",
    names: ["Blood Tap"],
    spellIds: [45529],
    flavor: ["wrath"],
    showAsCooldown: { durationMs: 0 }, // still a cooldown marker, but no lane tint
    note: "Blood Tap's buff duration is not useful on the timeline; show the press only.",
  },
  {
    id: "deep-wounds-trigger",
    names: ["Deep Wounds"],
    spellIds: [12162, 12850, 12868],
    flavor: ["nightmare-of-ursol"],
    hide: true,
    note: "Every Deep Wound bleed (#12721) is logged with a Deep Wounds talent cast beside it; keep only the bleed.",
  },
];

const normalize = (name: string) => name.trim().toLowerCase();

/** Overrides that apply to a log with these flavor tags. */
export function activeOverrides(flavor: readonly string[], overrides: readonly SpellOverride[] = SPELL_OVERRIDES): SpellOverride[] {
  const tags = new Set(flavor);
  return overrides.filter((o) => (o.flavor ?? []).every((t) => tags.has(t)));
}

/** The first override matching a spell by ID or name. */
export function findOverride(
  overrides: readonly SpellOverride[],
  spellId: number | null,
  spellName: string | null,
): SpellOverride | undefined {
  const name = spellName ? normalize(spellName) : null;
  return overrides.find(
    (o) =>
      (spellId != null && o.spellIds?.includes(spellId)) ||
      (name != null && o.names?.some((n) => normalize(n) === name)),
  );
}
