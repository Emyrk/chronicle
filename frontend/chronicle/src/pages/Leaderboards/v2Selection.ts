import { TABS, type HubTab } from "./Hub/hubTabs"

const tabIDs = new Set<string>(TABS.map((tab) => tab.id))

export function v2Selection(params: URLSearchParams): { tab: HubTab; instance: string | null; realmIDs: string[] } {
  const tab = params.get("tab")
  return {
    tab: tab && tabIDs.has(tab) ? tab as HubTab : "overview",
    instance: params.get("instance"),
    realmIDs: [...new Set((params.get("realm_ids") ?? "").split(",").filter(Boolean))],
  }
}
