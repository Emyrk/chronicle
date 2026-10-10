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
   * spell only appears as a buff, each buff's real duration is.
   */
  showAsCooldown?: { durationMs?: number };
  /** Why the override exists. */
  note: string;
}

export const SPELL_OVERRIDES: SpellOverride[] = [
  {
    id: "eclipse",
    names: ["Nature Eclipse", "Arcane Eclipse"],
    spellIds: [51442, 51443],
    flavor: ["nightmare-of-ursol"],
    showAsCooldown: {},
    note: "Eclipse procs change a balance druid's damage enough to show their duration like a cooldown.",
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
