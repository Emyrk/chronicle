import { TABS, type HubTab } from "./Hub/hubTabs"

const tabIDs = new Set<string>(TABS.map((tab) => tab.id))

/** Keep the active tab and ratings realm filter when navigating between instances. */
export function hubParams(params: URLSearchParams, key: "tab" | "instance" | "realm_ids" | "encounter", value?: string): URLSearchParams {
  const next = new URLSearchParams(params)
  if (key === "instance" && next.get("instance") !== (value ?? null)) {
    next.delete("encounter")
    next.delete("difficulty")
    next.delete("size")
  }
  if (value) next.set(key, value)
  else next.delete(key)
  return next
}

export function v2Selection(params: URLSearchParams): { tab: HubTab; instance: string | null; realmIDs: string[]; encounter: string | null } {
  const tab = params.get("tab")
  return {
    tab: tab && tabIDs.has(tab) ? tab as HubTab : "overview",
    instance: params.get("instance"),
    encounter: params.get("encounter"),
    realmIDs: [...new Set((params.get("realm_ids") ?? "").split(",").filter(Boolean))],
  }
}
