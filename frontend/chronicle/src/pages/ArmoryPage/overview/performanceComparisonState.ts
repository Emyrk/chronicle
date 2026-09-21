import type { ParseMetric } from "./util";
import type { PerformanceDateRange } from "./performanceExplorerModel";

export type PerformanceDisplayMode = "raw" | "parse";

export interface PerformancePlayerSelection {
  id: string;
  spec: string | null;
  subSpec: string | null;
  hidden: boolean;
}

export interface PerformanceComparisonState {
  realmName: string;
  players: PerformancePlayerSelection[];
  metric: ParseMetric;
  display: PerformanceDisplayMode;
  dateRange: PerformanceDateRange;
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  encounters: string[];
  showAverage: boolean;
  showBestThreeAverage: boolean;
}

export const DEFAULT_PERFORMANCE_COMPARISON_STATE: PerformanceComparisonState = {
  realmName: "",
  players: [],
  metric: "dps",
  display: "raw",
  dateRange: "180d",
  instanceName: "",
  difficultyName: "",
  maxPlayers: 0,
  encounters: [],
  showAverage: true,
  showBestThreeAverage: true,
};

export function parsePerformanceComparisonState(searchParams: URLSearchParams): PerformanceComparisonState {
  const playerIds = searchParams.getAll("player").filter(Boolean).slice(0, 5);
  const specs = searchParams.getAll("spec");
  const subSpecs = searchParams.getAll("subspec");
  const hiddenPlayers = new Set(searchParams.getAll("hidden"));
  const metric = searchParams.get("metric");
  const display = searchParams.get("display");
  const dateRange = searchParams.get("range");
  const maxPlayers = Number.parseInt(searchParams.get("size") ?? "", 10);

  return {
    realmName: searchParams.get("realm") ?? "",
    players: playerIds.map((id, index) => ({
      id,
      spec: specs[index] || null,
      subSpec: subSpecs[index] || null,
      hidden: hiddenPlayers.has(id),
    })),
    metric: metric === "hps" ? "hps" : "dps",
    display: display === "parse" ? "parse" : "raw",
    dateRange: dateRange === "30d" || dateRange === "60d" ? dateRange : "180d",
    instanceName: searchParams.get("instance") ?? "",
    difficultyName: searchParams.get("difficulty") ?? "",
    maxPlayers: Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : 0,
    encounters: searchParams.getAll("encounter").filter(Boolean),
    showAverage: searchParams.get("average") !== "0",
    showBestThreeAverage: searchParams.get("best") !== "0",
  };
}

export function serializePerformanceComparisonState(state: PerformanceComparisonState): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (state.realmName) searchParams.set("realm", state.realmName);
  state.players.slice(0, 5).forEach((player) => searchParams.append("player", player.id));
  state.players.slice(0, 5).forEach((player) => searchParams.append("spec", player.spec ?? ""));
  state.players.slice(0, 5).forEach((player) => searchParams.append("subspec", player.subSpec ?? ""));
  state.players.slice(0, 5).filter((player) => player.hidden).forEach((player) => searchParams.append("hidden", player.id));
  if (state.metric !== "dps") searchParams.set("metric", state.metric);
  if (state.display !== "raw") searchParams.set("display", state.display);
  if (state.dateRange !== "180d") searchParams.set("range", state.dateRange);
  if (state.instanceName) searchParams.set("instance", state.instanceName);
  if (state.difficultyName) searchParams.set("difficulty", state.difficultyName);
  if (state.maxPlayers > 0) searchParams.set("size", String(state.maxPlayers));
  state.encounters.forEach((encounter) => searchParams.append("encounter", encounter));
  if (!state.showAverage) searchParams.set("average", "0");
  if (!state.showBestThreeAverage) searchParams.set("best", "0");
  return searchParams;
}
