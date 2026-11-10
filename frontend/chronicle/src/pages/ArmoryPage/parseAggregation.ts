import type { CharacterEncounterStats, CharacterParse, PlayerOutfit } from "@/api/typesGenerated";

import {
  groupProgression,
  type ProgressionVariant,
} from "@/components/ui/Progression/progression";

/**
 * Best display score per instance (raid night), for coloring calendar cells.
 * Keyed by instance_id.
 */
export function bestScoreByInstance(parses: readonly CharacterParse[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of parses) {
    const prev = map.get(p.instance_id);
    if (prev === undefined || p.display_score > prev) {
      map.set(p.instance_id, p.display_score);
    }
  }
  return map;
}

function roundDisplay(v: number): number {
  return Math.max(0, Math.min(100, Math.floor(v + 0.5)));
}

/**
 * Average parse score per instance (raid night), rounded like the server.
 * Keyed by instance_id.
 */
export function averageScoreByInstance(parses: readonly CharacterParse[]): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const p of parses) {
    const acc = sums.get(p.instance_id);
    if (acc) {
      acc.sum += p.precise_score;
      acc.count++;
    } else {
      sums.set(p.instance_id, { sum: p.precise_score, count: 1 });
    }
  }
  const map = new Map<string, number>();
  for (const [id, { sum, count }] of sums) {
    map.set(id, roundDisplay(sum / count));
  }
  return map;
}

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
