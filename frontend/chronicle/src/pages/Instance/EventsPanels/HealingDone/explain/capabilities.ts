/**
 * Capability derivation for Healing Done lessons.
 *
 * Inspects a live UnifiedHealingResult to determine which lessons the user's
 * data can demonstrate right now. Pure function — no DOM inference, no React.
 */

import type { UnifiedHealingResult } from "../../processors/healing.processor";

/** Summary of what the current live UnifiedHealingResult can demonstrate. */
export interface HealingDoneCapabilities {
  /** Multiple healers in the chart */
  hasMultipleHealers: boolean;
  /** At least one healer has ability breakout data */
  hasAbilityBreakout: boolean;
  /** At least one healer has per-target breakout data */
  hasTargetBreakout: boolean;
  /** Any overhealing was recorded */
  hasOverheal: boolean;
  /** Per-second values are derivable (non-zero duration) */
  hasDuration: boolean;
}

/** Derive capabilities from a live UnifiedHealingResult. */
export function deriveCapabilities(
  result: UnifiedHealingResult | null | undefined,
  durationMs: number,
): HealingDoneCapabilities {
  const empty: HealingDoneCapabilities = {
    hasMultipleHealers: false,
    hasAbilityBreakout: false,
    hasTargetBreakout: false,
    hasOverheal: false,
    hasDuration: durationMs > 0,
  };

  if (!result) return empty;

  let hasOverheal = false;
  outer: for (const targets of result.HealerByTargetOverheal.values()) {
    for (const amount of targets.values()) {
      if (amount > 0) {
        hasOverheal = true;
        break outer;
      }
    }
  }

  return {
    ...empty,
    hasMultipleHealers: result.EncounterHealingByHealer.size > 1,
    hasAbilityBreakout: result.HealerByAbility.size > 0,
    hasTargetBreakout: result.HealerByTarget.size > 0,
    hasOverheal,
  };
}
