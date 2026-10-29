import type { ParseMetric } from "./util";
import type { PerformanceDateRange } from "./performanceExplorerModel";

export type PerformanceDisplayMode = "raw" | "parse";

/** The detail tab under the chart. */
export type PerformanceDetailTab = "runs" | "numbers" | "gear";

const DETAIL_TABS: readonly PerformanceDetailTab[] = ["runs", "numbers", "gear"];

export interface PerformancePlayerSelection {
  id: string;
  realmName: string;
  spec: string | null;
  subSpec: string | null;
  hidden: boolean;
}

export function performancePlayerKey(player: Pick<PerformancePlayerSelection, "id" | "realmName">): string {
  return `${player.realmName}\u0000${player.id}`;
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
  detailTab: PerformanceDetailTab;
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
  detailTab: "runs",
};

export function parsePerformanceComparisonState(searchParams: URLSearchParams): PerformanceComparisonState {
  const playerIds = searchParams.getAll("player").filter(Boolean).slice(0, 5);
  const playerRealms = searchParams.getAll("player_realm");
  const specs = searchParams.getAll("spec");
  const subSpecs = searchParams.getAll("subspec");
  const hiddenPlayers = new Set(searchParams.getAll("hidden"));
  const legacyRealmName = searchParams.get("realm") ?? "";
  const metric = searchParams.get("metric");
  const display = searchParams.get("display");
  const dateRange = searchParams.get("range");
  const maxPlayers = Number.parseInt(searchParams.get("size") ?? "", 10);

  return {
    realmName: legacyRealmName || playerRealms[0] || "",
    players: playerIds.map((id, index) => {
      const realmName = playerRealms[index] || legacyRealmName;
      return {
        id,
        realmName,
        spec: specs[index] || null,
        subSpec: subSpecs[index] || null,
        hidden: hiddenPlayers.has(performancePlayerKey({ id, realmName })) || hiddenPlayers.has(id),
      };
    }),
    metric: metric === "hps" ? "hps" : "dps",
    display: display === "parse" ? "parse" : "raw",
    dateRange: dateRange === "30d" || dateRange === "60d" ? dateRange : "180d",
    instanceName: searchParams.get("instance") ?? "",
    difficultyName: searchParams.get("difficulty") ?? "",
    maxPlayers: Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : 0,
    encounters: searchParams.getAll("encounter").filter(Boolean),
    showAverage: searchParams.get("average") !== "0",
    showBestThreeAverage: searchParams.get("best") !== "0",
    detailTab: DETAIL_TABS.find((tab) => tab === searchParams.get("tab")) ?? "runs",
  };
}

export function serializePerformanceComparisonState(state: PerformanceComparisonState): URLSearchParams {
  const searchParams = new URLSearchParams();
  const players = state.players.slice(0, 5);
  const primaryRealmName = players[0]?.realmName || state.realmName;
  if (primaryRealmName) searchParams.set("realm", primaryRealmName);
  players.forEach((player) => searchParams.append("player", player.id));
  players.forEach((player) => searchParams.append("player_realm", player.realmName || primaryRealmName));
  players.forEach((player) => searchParams.append("spec", player.spec ?? ""));
  players.forEach((player) => searchParams.append("subspec", player.subSpec ?? ""));
  players.filter((player) => player.hidden).forEach((player) => searchParams.append("hidden", performancePlayerKey(player)));
  if (state.metric !== "dps") searchParams.set("metric", state.metric);
  if (state.display !== "raw") searchParams.set("display", state.display);
  if (state.dateRange !== "180d") searchParams.set("range", state.dateRange);
  if (state.instanceName) searchParams.set("instance", state.instanceName);
  if (state.difficultyName) searchParams.set("difficulty", state.difficultyName);
  if (state.maxPlayers > 0) searchParams.set("size", String(state.maxPlayers));
  state.encounters.forEach((encounter) => searchParams.append("encounter", encounter));
  if (!state.showAverage) searchParams.set("average", "0");
  if (!state.showBestThreeAverage) searchParams.set("best", "0");
  if (state.detailTab !== "runs") searchParams.set("tab", state.detailTab);
  return searchParams;
}
