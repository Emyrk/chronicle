import type { ArmoryPlayer } from "@/api/typesGenerated";
import { SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";

export type ParseMetric = "dps" | "hps";

/** The heatmap window: 12 full weeks, aligned to the start of the week. */
export const ACTIVITY_WEEKS = 12;

/** Talent trees whose deepest investment marks the character as a healer. */
const HEALING_TREES = new Set(["Holy", "Restoration", "Discipline"]);

/**
 * Tree names from COMBATANT_TALENTS when the log had them, else the
 * class's standard tree names by index.
 */
export function treeName(player: ArmoryPlayer, index: number): string {
  return (
    player.talents?.trees[index]?.tab_name ||
    SPEC_BY_CLASS[player.class]?.[index] ||
    `Tree ${index + 1}`
  );
}

export function defaultMetric(player: ArmoryPlayer): ParseMetric {
  const trees = player.talents?.trees;
  if (!trees) return "dps";
  const deepestIdx = trees.reduce(
    (best, t, i) => (t.points_spent > trees[best].points_spent ? i : best),
    0,
  );
  const deepest = trees[deepestIdx];
  return deepest.points_spent > 0 && HEALING_TREES.has(treeName(player, deepestIdx))
    ? "hps"
    : "dps";
}
