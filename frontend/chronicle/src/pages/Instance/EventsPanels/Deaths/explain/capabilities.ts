/**
 * Capability derivation for Death Log lessons. Pure function.
 */

import type { DeathsResult } from "../deaths.processor";

export interface DeathLogCapabilities {
  /** Any player deaths recorded in the selection. */
  hasDeaths: boolean;
  /** At least one death carries a recap (incoming events before death). */
  hasRecaps: boolean;
}

export function deriveCapabilities(
  result: DeathsResult | null | undefined,
): DeathLogCapabilities {
  const deaths = result?.DeathEvents ?? [];
  return {
    hasDeaths: deaths.length > 0,
    hasRecaps: deaths.some((d) => d.recap.length > 0),
  };
}
