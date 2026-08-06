import type { Instance } from "../../../InstancePage";
import type { ComparisonResult } from "../comparison.processor";

export interface ComparisonCapabilities {
  hasRaidRoster: boolean;
}

export function deriveCapabilities(
  _result: ComparisonResult | null,
  _durationMs: number,
  instance: Instance | null,
): ComparisonCapabilities {
  return {
    hasRaidRoster: Object.keys(instance?.players ?? {}).length > 0,
  };
}
