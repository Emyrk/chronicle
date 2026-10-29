import type { SpeedrunBoardRecord, SpeedrunInstanceBoard, SupportedInstance } from "@/api/typesGenerated";
import { getInstanceAbbrev } from "@/pages/Logs/utils/instanceImages";
import { getInstanceCategory } from "@/pages/Logs/utils/instanceCategory";

export type ThroneKind = "raid" | "dungeon" | "custom";
export type ThroneTab = "all" | ThroneKind;

/** One speedrun board (instance + difficulty) and who holds its record; no record is an unclaimed throne. */
export interface Throne {
  key: string;
  instanceName: string;
  difficultyName: string;
  title: string;
  kind: ThroneKind;
  record: SpeedrunBoardRecord | null;
}

export const HOTTEST_COUNT = 5;
export const WALL_PREVIEW = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

export function thronesFromBoards(
  boards: readonly SpeedrunInstanceBoard[],
  supported: readonly SupportedInstance[] | undefined,
): Throne[] {
  return boards.map((board) => {
    const category = getInstanceCategory(board.instance_name, supported);
    return {
      key: `${board.instance_name}\u0000${board.difficulty_name}`,
      instanceName: board.instance_name,
      difficultyName: board.difficulty_name,
      // As on the speedrun leaderboard: boards with no recorded difficulty keep the bare name.
      title: board.difficulty_name === "" ? board.instance_name : `${board.instance_name} (${board.difficulty_name})`,
      kind: category === "unknown" ? "custom" : category,
      record: board.record ?? null,
    };
  });
}

function recordTime(throne: Throne): number {
  return throne.record ? new Date(throne.record.completion_time).getTime() : -Infinity;
}

/** Newest record first, unclaimed thrones last (alphabetical). */
export function sortThrones(thrones: readonly Throne[]): Throne[] {
  return [...thrones].sort((a, b) => recordTime(b) - recordTime(a) || a.title.localeCompare(b.title));
}

/** "set today", "set this week", "held 18 days"; "be the first" for an unclaimed throne. */
export function throneFreshness(throne: Throne, now: Date): string {
  if (!throne.record) return "be the first";
  const days = Math.max(0, Math.floor((now.getTime() - recordTime(throne)) / DAY_MS));
  if (days === 0) return "set today";
  if (days <= 7) return "set this week";
  return `held ${days} days`;
}

/** The guild holding the most crowns, for "Cleave holds 4 of 5 crowns"; null with none claimed. */
export function crownLeader(thrones: readonly Throne[]): { guild: string; held: number; claimed: number } | null {
  const counts = new Map<string, number>();
  for (const throne of sortThrones(thrones)) {
    if (throne.record) counts.set(throne.record.guild_name, (counts.get(throne.record.guild_name) ?? 0) + 1);
  }
  let leader: { guild: string; held: number } | null = null;
  for (const [guild, held] of counts) {
    if (!leader || held > leader.held) leader = { guild, held };
  }
  const claimed = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return leader ? { ...leader, claimed } : null;
}

export function throneTabCounts(thrones: readonly Throne[]): Record<ThroneTab, number> {
  const counts: Record<ThroneTab, number> = { all: thrones.length, raid: 0, dungeon: 0, custom: 0 };
  for (const throne of thrones) counts[throne.kind]++;
  return counts;
}

/** The wall's tiles for a tab and a search ("MC" finds Molten Core by its abbreviation). */
export function filterThrones(thrones: readonly Throne[], tab: ThroneTab, query: string): Throne[] {
  const q = query.trim().toLowerCase();
  return thrones.filter(
    (throne) =>
      (tab === "all" || throne.kind === tab) &&
      (!q || throne.title.toLowerCase().includes(q) || getInstanceAbbrev(throne.instanceName).toLowerCase().includes(q)),
  );
}

export function leaderboardHref(throne: Throne): string {
  const difficulty = throne.difficultyName === "" ? "" : `&difficulty=${encodeURIComponent(throne.difficultyName)}`;
  return `/leaderboards/speedruns?instance=${encodeURIComponent(throne.instanceName)}&timing=full${difficulty}`;
}

export function recentRunsHref(throne: Throne): string {
  return `/recent?inst=${encodeURIComponent(throne.instanceName)}`;
}
