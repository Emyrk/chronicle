import type { GuildPanelDefinition } from "./types";
import { RecentRaidsPanel } from "./RecentRaids";
import { MarkdownPanel } from "./Markdown";
import { CalendarPanel } from "./Calendar";
import { RaidClearsPanel } from "./RaidClears";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPanelDefinition = GuildPanelDefinition<any>;

// Panel registry - all available panel types
export const PANEL_REGISTRY: Record<string, AnyPanelDefinition> = {
  recent_raids: RecentRaidsPanel,
  // roster: RosterPanel,
  // progress: ProgressPanel,
  // stats: StatsPanel,
  markdown: MarkdownPanel,
  // leaderboard: LeaderboardPanel,
  calendar: CalendarPanel,
  raid_clears: RaidClearsPanel,
};

export type PanelType = keyof typeof PANEL_REGISTRY;

export function getPanelDefinition(type: string): AnyPanelDefinition | undefined {
  return PANEL_REGISTRY[type];
}

export function getAllPanelTypes(): Array<{ type: string; definition: AnyPanelDefinition }> {
  return Object.entries(PANEL_REGISTRY).map(([type, definition]) => ({
    type,
    definition,
  }));
}
