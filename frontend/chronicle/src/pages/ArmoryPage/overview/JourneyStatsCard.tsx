import { HeaderStatsCard } from "./HeaderStatsCard";

interface JourneyStatsCardProps {
  /** Formatted time in combat over the heatmap window (e.g. "29h 22m"). */
  timeInRaid: string;
  /** Items looted (e.g. "37" or "200+"), or null while loading. */
  itemsLooted: string | null;
}

/** Participation-focused headline stats for Journey mode. */
export function JourneyStatsCard({ timeInRaid, itemsLooted }: JourneyStatsCardProps) {
  return (
    <HeaderStatsCard
      title="Journey"
      stats={[
        { value: timeInRaid, label: "in combat · 12 weeks" },
        { value: itemsLooted ?? "—", label: "items looted" },
      ]}
    />
  );
}
