import { TABS, type HubTab } from "./Hub/hubTabs"

const tabIDs = new Set<string>(TABS.map((tab) => tab.id))

/** Where the hub lives; each tab but Overview is a path segment under it. */
export const HUB_BASE = "/leaderboard-v2"

/** A valid hub tab from a path segment (or the old `tab=` query); anything else is undefined. */
export function hubTab(value: string | null | undefined): HubTab | undefined {
  return value && tabIDs.has(value) ? (value as HubTab) : undefined
}

/** The URL for a tab and query: `/leaderboard-v2` for Overview, `/leaderboard-v2/<tab>` otherwise. */
export function hubPath(tab: HubTab, params: URLSearchParams): string {
  const query = new URLSearchParams(params)
  query.delete("tab")
  const search = query.toString()
  return `${HUB_BASE}${tab === "overview" ? "" : `/${tab}`}${search ? `?${search}` : ""}`
}

/** Keep the ratings realm filter and other query state when navigating between instances. */
export function hubParams(params: URLSearchParams, key: "instance" | "realm_ids" | "encounters", value?: string): URLSearchParams {
  const next = new URLSearchParams(params)
  // The single-boss parameter predates multi-boss selection; any write replaces it.
  if (key === "encounters") next.delete("encounter")
  if (key === "instance" && next.get("instance") !== (value ?? null)) {
    next.delete("encounter")
    next.delete("encounters")
    next.delete("difficulty")
    next.delete("size")
  }
  if (value) next.set(key, value)
  else next.delete(key)
  return next
}

/**
 * The hub's state from its URL. The tab is the path segment (`pathTab`); `encounters` is the chosen
 * bosses (CSV, raid order), empty meaning the instance's preset.
 */
export function v2Selection(params: URLSearchParams, pathTab?: string): { tab: HubTab; instance: string | null; realmIDs: string[]; encounters: string[] } {
  const listed = params.get("encounters") ?? params.get("encounter") ?? ""
  return {
    tab: hubTab(pathTab) ?? "overview",
    instance: params.get("instance"),
    encounters: [...new Set(listed.split(",").map((name) => name.trim()).filter(Boolean))],
    realmIDs: [...new Set((params.get("realm_ids") ?? "").split(",").filter(Boolean))],
  }
}
