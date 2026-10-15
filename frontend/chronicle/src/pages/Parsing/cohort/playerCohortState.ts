import type { ParseScoreCohortBucket } from "@/api/typesGenerated";
import type { SelectOption } from "./CohortChrome";

export const DEFAULT_SUB_SPEC_VALUE = "__default__";

export interface PlayerSubSpecSelection {
  selected: string;
  options: SelectOption[];
  showControl: boolean;
}

export function selectPlayerSubSpec(values: readonly string[], requested: string): PlayerSubSpecSelection {
  const available = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const selected = available.includes(requested) ? requested : (available[0] ?? "");
  return {
    selected,
    options: available.map((subSpec) => ({
      value: subSpec || DEFAULT_SUB_SPEC_VALUE,
      label: subSpec || "Default",
    })),
    showControl: available.length > 1 || (available.length === 1 && available[0] !== ""),
  };
}

export function playerCohortSizeKey(bucket: ParseScoreCohortBucket): string {
  return `${bucket.difficulty_name}|${bucket.max_players}`;
}

export function selectPlayerCohortSize(
  buckets: readonly ParseScoreCohortBucket[],
  requestedKey: string,
): ParseScoreCohortBucket | undefined {
  return buckets.find((bucket) => playerCohortSizeKey(bucket) === requestedKey) ?? buckets[0];
}
