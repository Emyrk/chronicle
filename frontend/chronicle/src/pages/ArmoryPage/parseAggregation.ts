import type { CharacterEncounterStats, PlayerOutfit } from "@/api/typesGenerated";

import {
  groupProgression,
  type ProgressionVariant,
} from "@/components/ui/Progression/progression";

export type RaidProgress = ProgressionVariant;

/**
 * Returns one row per instance variant, ordered by total kills descending.
 * The shared progression model handles canonical encounter filtering.
 */
export function summarizeProgress(
  stats: readonly CharacterEncounterStats[],
  progressionBosses?: Map<string, Set<string>>,
): RaidProgress[] {
  return groupProgression(stats, progressionBosses)
    .flatMap((instance) => instance.variants)
    .sort((a, b) => b.kills - a.kills);
}

/** PlayerOutfit slots that never count toward average item level. */
const SLOT_SHIRT = 3;
const SLOT_TABARD = 18;

/**
 * Average item level across equipped slots (shirt/tabard excluded), matching
 * the server's gear-history avg_ilvl. Null when no item level is known —
 * e.g. gear stored before item levels were recorded.
 */
export function averageItemLevel(gear: PlayerOutfit): number | null {
  let sum = 0;
  let count = 0;
  gear.forEach((item, i) => {
    if (i === SLOT_SHIRT || i === SLOT_TABARD) return;
    if (!item.item_id || item.item_level == null) return;
    sum += item.item_level;
    count++;
  });
  return count === 0 ? null : sum / count;
}
