/**
 * Capability derivation for Damage Done lessons.
 *
 * Inspects a live DamageDoneResult to determine which lessons the user can
 * meaningfully learn from their own data right now, versus which need curated
 * example data.
 *
 * Pure function — no DOM inference, no React.
 */

import type { Instance } from "../../../InstancePage";
import { isPetGuidFast } from "../../processors/guidCache";
import type { DamageDoneResult } from "../damageDone.processor";

/** Summary of what the current live DamageDoneResult can demonstrate. */
export interface DamageDoneCapabilities {
  /** Multiple players in the chart */
  hasMultiplePlayers: boolean;
  /** At least one player has ability breakout data */
  hasAbilityBreakout: boolean;
  /** At least one player has target breakout data */
  hasTargetBreakout: boolean;
  /** At least one ability has detailed hit-type stats (HitStats, CritStats, …) */
  hasDetailedStats: boolean;
  /** ByAbilityBySpellId has distinct spell IDs sharing an ability name (ranks) */
  hasSpellRanks: boolean;
  /** At least two players with data (for focus comparison) */
  hasFocusTarget: boolean;
  /** Per-second values are derivable (non-zero duration) */
  hasDuration: boolean;
  /** More than one encounter is selected/available to aggregate */
  hasMultipleEncounters: boolean;
  /** Pet units contributed damage */
  hasPets: boolean;
}

/** Derive capabilities from a live DamageDoneResult. */
export function deriveCapabilities(
  result: DamageDoneResult | null | undefined,
  durationMs: number,
  instance: Instance | null | undefined,
): DamageDoneCapabilities {
  const empty: DamageDoneCapabilities = {
    hasMultiplePlayers: false,
    hasAbilityBreakout: false,
    hasTargetBreakout: false,
    hasDetailedStats: false,
    hasSpellRanks: false,
    hasFocusTarget: false,
    hasDuration: durationMs > 0,
    hasMultipleEncounters: (instance?.encounters?.length ?? 0) > 1,
    hasPets: false,
  };

  if (!result) return empty;

  // Unique units across all encounters; pets identified by GUID shape.
  const playerIds = new Set<string>();
  let hasPets = false;
  for (const encounterMap of result.EncounterDamage.values()) {
    for (const unitId of encounterMap.keys()) {
      if (isPetGuidFast(unitId)) {
        hasPets = true;
      } else {
        playerIds.add(unitId);
      }
    }
  }

  const hasAbilityBreakout = result.ByAbility.size > 0;
  const hasTargetBreakout = result.ByTarget.size > 0;

  // Detailed hit-type stats in any ability breakout.
  let hasDetailedStats = false;
  outer: for (const abilities of result.ByAbility.values()) {
    for (const breakout of abilities.values()) {
      if (
        breakout.HitStats ||
        breakout.CritStats ||
        breakout.GlancingStats ||
        breakout.CrushingStats
      ) {
        hasDetailedStats = true;
        break outer;
      }
    }
  }

  // Spell ranks: multiple spell IDs sharing one ability name.
  let hasSpellRanks = false;
  outer: for (const spells of result.ByAbilityBySpellId.values()) {
    const seenNames = new Set<string>();
    for (const breakout of spells.values()) {
      if (seenNames.has(breakout.spellName)) {
        hasSpellRanks = true;
        break outer;
      }
      seenNames.add(breakout.spellName);
    }
  }

  return {
    ...empty,
    hasMultiplePlayers: playerIds.size > 1,
    hasAbilityBreakout,
    hasTargetBreakout,
    hasDetailedStats,
    hasSpellRanks,
    hasFocusTarget: playerIds.size >= 2,
    hasPets,
  };
}
