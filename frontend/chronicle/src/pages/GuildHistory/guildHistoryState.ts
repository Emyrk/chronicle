import type { ClearPart } from "./guildHistoryModel";

export type GuildHistoryTiming = "full" | "boss";
export type GuildHistoryDisplay = "time" | "parse";
export type GuildHistoryDateRange = "180d" | "60d" | "30d";
export type GuildHistoryTab = "runs" | "bosses";

export interface GuildHistoryState {
  guildIds: string[];
  /** Selected guilds left out of the stats and chart, toggled with Shift+click. */
  hiddenGuildIds: string[];
  /** Empty until chosen: the page falls back to the most recently cleared raid. */
  instanceName: string;
  timing: GuildHistoryTiming;
  /** Times, or time parses where they exist (whole clears and boss kills). */
  display: GuildHistoryDisplay;
  /** A boss to chart on its own; empty charts the whole clear. */
  boss: string;
  /** One part of each clear to chart instead; ignored when a boss is focused. */
  part: ClearPart | "";
  dateRange: GuildHistoryDateRange;
  includeUnqualified: boolean;
  tab: GuildHistoryTab;
}

export const DEFAULT_GUILD_HISTORY_STATE: GuildHistoryState = {
  guildIds: [],
  hiddenGuildIds: [],
  instanceName: "",
  timing: "full",
  display: "time",
  boss: "",
  part: "",
  dateRange: "180d",
  includeUnqualified: false,
  tab: "bosses",
};

export const GUILD_HISTORY_RANGE_DAYS: Record<GuildHistoryDateRange, number> = { "180d": 180, "60d": 60, "30d": 30 };

export function parseGuildHistoryState(params: URLSearchParams): GuildHistoryState {
  const timing = params.get("timing");
  const range = params.get("range");
  const tab = params.get("tab");
  const part = params.get("part");
  return {
    guildIds: [...new Set(params.getAll("guild").filter(Boolean))],
    hiddenGuildIds: [...new Set(params.getAll("hide").filter(Boolean))],
    instanceName: params.get("instance") ?? "",
    timing: timing === "boss" ? "boss" : "full",
    display: params.get("display") === "parse" ? "parse" : "time",
    boss: params.get("boss") ?? "",
    part: part === "boss" || part === "trash" || part === "idle" ? part : "",
    dateRange: range === "60d" || range === "30d" ? range : "180d",
    includeUnqualified: params.get("unqualified") === "1",
    tab: tab === "runs" ? "runs" : "bosses",
  };
}

/** Defaults stay out of the URL so shared links stay short. */
export function serializeGuildHistoryState(state: GuildHistoryState): URLSearchParams {
  const params = new URLSearchParams();
  for (const guildId of state.guildIds) params.append("guild", guildId);
  for (const guildId of state.hiddenGuildIds) {
    if (state.guildIds.includes(guildId)) params.append("hide", guildId);
  }
  if (state.instanceName) params.set("instance", state.instanceName);
  if (state.timing !== "full") params.set("timing", state.timing);
  if (state.display !== "time") params.set("display", state.display);
  if (state.boss) params.set("boss", state.boss);
  else if (state.part) params.set("part", state.part);
  if (state.dateRange !== "180d") params.set("range", state.dateRange);
  if (state.includeUnqualified) params.set("unqualified", "1");
  if (state.tab !== "bosses") params.set("tab", state.tab);
  return params;
}
