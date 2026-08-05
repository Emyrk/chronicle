import { differenceInCalendarWeeks } from "date-fns";
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

export interface ActivityStats {
  /** Days with at least one raid in the window. */
  nights: number;
  /** Total raid time in the window, in milliseconds. */
  totalMs: number;
  /** Consecutive raiding weeks, counting back from the latest raiding week. */
  weekStreak: number;
}

export function computeActivityStats(
  instances: readonly { first_encounter_time: string; duration_ms: number | null }[],
  start: Date,
): ActivityStats {
  const days = new Set<string>();
  const raidWeeks = new Set<number>();
  let totalMs = 0;
  for (const inst of instances) {
    const date = new Date(inst.first_encounter_time);
    days.add(date.toDateString());
    totalMs += inst.duration_ms ?? 0;
    raidWeeks.add(differenceInCalendarWeeks(date, start));
  }

  let weekStreak = 0;
  for (let w = ACTIVITY_WEEKS - 1; w >= 0; w--) {
    if (raidWeeks.has(w)) {
      weekStreak++;
    } else if (weekStreak > 0 || w < ACTIVITY_WEEKS - 1) {
      // The current (possibly partial) week may be empty without breaking.
      break;
    }
  }

  return { nights: days.size, totalMs, weekStreak };
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
