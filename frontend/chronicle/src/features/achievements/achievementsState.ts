import type { AchievementFilter } from "./achievementsModel";

/** Browser UI state, kept in the URL so a category or search can be linked. */
export interface AchievementsBrowserState {
  /** Category ID, or "" for the summary view. */
  category: string;
  filter: AchievementFilter;
  search: string;
}

export const DEFAULT_ACHIEVEMENTS_STATE: AchievementsBrowserState = { category: "", filter: "all", search: "" };

const FILTERS: readonly AchievementFilter[] = ["all", "earned", "incomplete", "rewards"];

export function parseAchievementsState(params: URLSearchParams): AchievementsBrowserState {
  const filter = params.get("filter") as AchievementFilter | null;
  return {
    category: params.get("category") ?? "",
    filter: filter && FILTERS.includes(filter) ? filter : "all",
    search: params.get("q") ?? "",
  };
}

export function serializeAchievementsState(state: AchievementsBrowserState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.category) params.set("category", state.category);
  if (state.filter !== "all") params.set("filter", state.filter);
  if (state.search) params.set("q", state.search);
  return params;
}
