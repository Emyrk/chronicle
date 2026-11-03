import { TABS, type HubTab } from "./Hub/hubTabs"

const tabIDs = new Set<string>(TABS.map((tab) => tab.id))

/** Keep the active tab and ratings realm filter when navigating between instances. */
export function hubParams(params: URLSearchParams, key: "tab" | "instance" | "realm_ids" | "encounters", value?: string): URLSearchParams {
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

/** `encounters` is the chosen bosses (CSV, raid order); empty means the instance's preset. */
export function v2Selection(params: URLSearchParams): { tab: HubTab; instance: string | null; realmIDs: string[]; encounters: string[] } {
  const tab = params.get("tab")
  const listed = params.get("encounters") ?? params.get("encounter") ?? ""
  return {
    tab: tab && tabIDs.has(tab) ? tab as HubTab : "overview",
    instance: params.get("instance"),
    encounters: [...new Set(listed.split(",").map((name) => name.trim()).filter(Boolean))],
    realmIDs: [...new Set((params.get("realm_ids") ?? "").split(",").filter(Boolean))],
  }
}
