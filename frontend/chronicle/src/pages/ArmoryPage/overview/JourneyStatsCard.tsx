import type { ReactNode } from "react";
import { HeaderStatsCard, type HeaderStat } from "./HeaderStatsCard";

interface JourneyStatsCardProps {
  /** Formatted time in combat over the heatmap window (e.g. "29h 22m"). */
  timeInRaid: string;
  /** Items looted (e.g. "37" or "200+"), or null while loading. */
  itemsLooted: string | null;
  /** All-spec career Renown, when ratings are available. */
  renown?: ReactNode;
}

/** Participation-focused headline stats for Journey mode. */
export function JourneyStatsCard({ timeInRaid, itemsLooted, renown }: JourneyStatsCardProps) {
  const stats: HeaderStat[] = [
    { value: timeInRaid, label: "in combat · 12 weeks" },
    { value: itemsLooted ?? "—", label: "items looted" },
  ];
  if (renown !== undefined) stats.push({ value: renown, label: "Renown · all specs" });
  return <HeaderStatsCard title="Journey" stats={stats} />;
}
