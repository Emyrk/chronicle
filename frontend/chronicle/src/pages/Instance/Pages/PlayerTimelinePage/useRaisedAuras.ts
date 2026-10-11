import { useCallback, useState } from "react";
import { normalizeSpellName } from "../../EventsPanels/RotationTimeline/useRotationView";
import type { SpellOverride } from "../../EventsPanels/RotationTimeline/spellOverrides";

const RAISED_STORAGE_KEY = "player-timeline-raised-auras";

function readRaised(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RAISED_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function writeRaised(names: readonly string[]) {
  try {
    window.localStorage.setItem(RAISED_STORAGE_KEY, JSON.stringify(names));
  } catch {
    // Storage unavailable: the list lasts for this page only.
  }
}

/**
 * Buffs the viewer raised onto the cast timeline from Buffs & debuffs, by name.
 * A per-viewer preference shared by every log.
 */
export function useRaisedAuras() {
  const [raised, setRaised] = useState<string[]>(readRaised);
  const isRaised = useCallback(
    (name: string) => raised.some((n) => normalizeSpellName(n) === normalizeSpellName(name)),
    [raised],
  );
  const toggleRaised = useCallback((name: string) => {
    setRaised((list) => {
      const key = normalizeSpellName(name);
      const next = list.some((n) => normalizeSpellName(n) === key)
        ? list.filter((n) => normalizeSpellName(n) !== key)
        : [...list, name];
      writeRaised(next);
      return next;
    });
  }, []);
  return { raised, isRaised, toggleRaised };
}

/**
 * Raised buffs as spell overrides: every gain draws as a proc that tints the
 * lane until the buff fades, the same as the Eclipse overrides. idsByName maps
 * a normalized name to the spell IDs seen for it, so lookups by ID match too.
 */
export function raisedAuraOverrides(names: readonly string[], idsByName: ReadonlyMap<string, number[]>): SpellOverride[] {
  return names.map((name) => ({
    id: `raised-${normalizeSpellName(name)}`,
    names: [name],
    spellIds: idsByName.get(normalizeSpellName(name)) ?? [],
    showAsCooldown: {},
    proc: true,
    raised: true,
    note: "Raised from Buffs & debuffs; click its name there to drop it.",
  }));
}
