/**
 * Capability derivation for All Activity lessons. Pure function.
 */

import type { AllActivityState } from "../../processors";

export interface AllActivityCapabilities {
  /** Any events processed in the selection. */
  hasEvents: boolean;
}

export function deriveCapabilities(result: AllActivityState | null | undefined): AllActivityCapabilities {
  return { hasEvents: (result?.totalProcessed ?? 0) > 0 };
}
