/**
 * Capability derivation for Damage Done Explain lessons.
 *
 * Inspects a live DamageDoneResult to determine which lessons the user
 * can meaningfully try right now vs. which need curated example data.
 *
 * Pure function — no DOM inference, no React.
 */

import type { DamageDoneResult } from "../damageDone.processor";

/**
 * Lesson state determines how each lesson renders in the list:
 *
 * - available:        "Try it" action — live data supports the lesson
 * - limited:          "Try it" + "See richer example" — live data is partial
 * - example-required: muted lesson + "See example" — live data doesn't support it
 */
export type LessonState = "available" | "limited" | "example-required";

/** Summary of what the current live DamageDoneResult can demonstrate. */
export interface CapabilitySummary {
  /** Multiple players in the chart */
  hasMultiplePlayers: boolean;
  /** At least one player has ability breakout data */
  hasAbilityBreakout: boolean;
  /** At least one player has target breakout data */
  hasTargetBreakout: boolean;
  /** At least one ability has detailed hit-type stats (HitStats, CritStats, etc.) */
  hasDetailedStats: boolean;
  /** ByAbilityBySpellId has entries with distinct spell IDs for the same ability name */
  hasSpellRanks: boolean;
  /** At least two players with data (for focus comparison) */
  hasFocusTarget: boolean;
  /** Has per-second derivable data (non-zero duration) */
  hasDuration: boolean;
}

/** Derive capabilities from a live DamageDoneResult. */
export function deriveCapabilities(
  result: DamageDoneResult | null | undefined,
  durationMs: number,
): CapabilitySummary {
  const empty: CapabilitySummary = {
    hasMultiplePlayers: false,
    hasAbilityBreakout: false,
    hasTargetBreakout: false,
    hasDetailedStats: false,
    hasSpellRanks: false,
    hasFocusTarget: false,
    hasDuration: durationMs > 0,
  };

  if (!result) return empty;

  // Count unique players across all encounters
  const playerIds = new Set<string>();
  for (const encounterMap of result.EncounterDamage.values()) {
    for (const playerId of encounterMap.keys()) {
      playerIds.add(playerId);
    }
  }

  const hasAbilityBreakout = result.ByAbility.size > 0;
  const hasTargetBreakout = result.ByTarget.size > 0;

  // Check for detailed hit-type stats in any ability breakout
  let hasDetailedStats = false;
  for (const abilities of result.ByAbility.values()) {
    for (const breakout of abilities.values()) {
      if (breakout.HitStats || breakout.CritStats || breakout.GlancingStats || breakout.CrushingStats) {
        hasDetailedStats = true;
        break;
      }
    }
    if (hasDetailedStats) break;
  }

  // Check for spell rank separation
  let hasSpellRanks = false;
  for (const spells of result.ByAbilityBySpellId.values()) {
    // Collect spell names — if multiple spell IDs share the same name, there are ranks
    const nameToIds = new Map<string, number[]>();
    for (const [spellId, breakout] of spells) {
      const existing = nameToIds.get(breakout.spellName);
      if (existing) {
        existing.push(spellId);
        hasSpellRanks = true;
        break;
      } else {
        nameToIds.set(breakout.spellName, [spellId]);
      }
    }
    if (hasSpellRanks) break;
  }

  return {
    hasMultiplePlayers: playerIds.size > 1,
    hasAbilityBreakout,
    hasTargetBreakout,
    hasDetailedStats,
    hasSpellRanks,
    hasFocusTarget: playerIds.size >= 2,
    hasDuration: durationMs > 0,
  };
}

/** All lesson IDs for the Damage Done Explain page. */
export type LessonId =
  | "reading-chart"
  | "dps-vs-total"
  | "parse-scores"
  | "breakout-box"
  | "abilities-vs-targets"
  | "detailed-results"
  | "spell-ranks"
  | "focus";

export interface LessonMeta {
  id: LessonId;
  title: string;
  description: string;
}

/** Ordered list of lessons. */
export const LESSONS: LessonMeta[] = [
  {
    id: "reading-chart",
    title: "Reading the Chart",
    description: "Understand the player damage bars — names, class colours, and relative sizing.",
  },
  {
    id: "dps-vs-total",
    title: "DPS vs Total Damage",
    description: "Toggle Per Second to switch between total damage dealt and damage per second (DPS).",
  },
  {
    id: "parse-scores",
    title: "Parse Scores",
    description: "Coloured pills beside each player show how their performance compares to the community.",
  },
  {
    id: "breakout-box",
    title: "The Breakout Box",
    description: "Click a player row to open a detailed breakdown of their damage by ability or target.",
  },
  {
    id: "abilities-vs-targets",
    title: "Abilities vs Targets",
    description: "Switch between 'By Ability' and 'By Target' tabs inside the Breakout Box.",
  },
  {
    id: "detailed-results",
    title: "Detailed Hit Results",
    description: "Expand ability rows to see hit types (normal, crit, glancing) with min/avg/max values.",
  },
  {
    id: "spell-ranks",
    title: "Spell Ranks",
    description: "Toggle Ranks to separate abilities by spell rank — useful for spotting down-ranked casts.",
  },
  {
    id: "focus",
    title: "Focus Mode",
    description: "Ctrl+click (Cmd+click on Mac) a player row and choose Focus to see their per-ability chart with full breakouts.",
  },
];

/** Resolve the lesson state given the current live capabilities. */
export function resolveLessonState(
  lessonId: LessonId,
  caps: CapabilitySummary,
): LessonState {
  switch (lessonId) {
    case "reading-chart":
      if (caps.hasMultiplePlayers) return "available";
      return "limited";

    case "dps-vs-total":
      if (caps.hasMultiplePlayers && caps.hasDuration) return "available";
      if (caps.hasDuration) return "limited";
      return "example-required";

    case "parse-scores":
      // Parse scores require API data that may 404 for most instances
      return "example-required";

    case "breakout-box":
      if (caps.hasAbilityBreakout) return "available";
      return "example-required";

    case "abilities-vs-targets":
      if (caps.hasAbilityBreakout && caps.hasTargetBreakout) return "available";
      if (caps.hasAbilityBreakout || caps.hasTargetBreakout) return "limited";
      return "example-required";

    case "detailed-results":
      if (caps.hasDetailedStats) return "available";
      if (caps.hasAbilityBreakout) return "limited";
      return "example-required";

    case "spell-ranks":
      if (caps.hasSpellRanks) return "available";
      if (caps.hasAbilityBreakout) return "limited";
      return "example-required";

    case "focus":
      if (caps.hasFocusTarget && caps.hasAbilityBreakout) return "available";
      if (caps.hasFocusTarget) return "limited";
      return "example-required";
  }
}
