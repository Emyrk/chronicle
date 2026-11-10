import { TABS, type HubTab } from "./Hub/hubTabs"

const tabIDs = new Set<string>(TABS.map((tab) => tab.id))

/** Where the hub lives; each tab but Overview is a path segment under it. */
export const HUB_BASE = "/leaderboards"

/** A valid hub tab from a path segment (or the old `tab=` query); anything else is undefined. */
export function hubTab(value: string | null | undefined): HubTab | undefined {
  return value && tabIDs.has(value) ? (value as HubTab) : undefined
}

/** Encode an instance name for a readable path while preserving all non-space characters. */
export function instancePathSegment(instance: string): string {
  return encodeURIComponent(instance.replaceAll(" ", "-"))
}

/** Decode an instance path segment back to the exact name expected by leaderboard APIs. */
export function instanceNameFromPath(segment: string): string {
  return segment.replaceAll("-", " ")
}

/** The URL for a tab and query, with the selected instance as a path segment. */
export function hubPath(tab: HubTab, params: URLSearchParams, instance?: string | null): string {
  const query = new URLSearchParams(params)
  query.delete("tab")
  query.delete("instance")
  const segments = [HUB_BASE]
  if (instance) segments.push(instancePathSegment(instance))
  if (tab !== "overview") segments.push(tab)
  const search = query.toString()
  return `${segments.join("/")}${search ? `?${search}` : ""}`
}

/** Keep filter query state while changing one of the remaining query-backed selections. */
export function hubParams(params: URLSearchParams, key: "realm_ids" | "encounters", value?: string): URLSearchParams {
  const next = new URLSearchParams(params)
  // The single-boss parameter predates multi-boss selection; any write replaces it.
  if (key === "encounters") next.delete("encounter")
  if (value) next.set(key, value)
  else next.delete(key)
  return next
}

/** Clear state that belongs to one instance before navigating to another instance path. */
export function hubInstanceParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete("instance")
  next.delete("encounter")
  next.delete("encounters")
  next.delete("difficulty")
  next.delete("size")
  return next
}

export type HubRouteParams = {
  /** The one segment after the base route: either a landing tab or an instance overview. */
  segment?: string
  /** The instance segment when a tab follows it. */
  instance?: string
  tab?: string
}

/**
 * The hub's state from its URL. A single known tab segment is a landing tab; any other single
 * segment is an instance overview. With two segments, the first is the instance and second is tab.
 */
export function v2Selection(params: URLSearchParams, route: HubRouteParams = {}): { tab: HubTab; instance: string | null; realmIDs: string[]; encounters: string[] } {
  const listed = params.get("encounters") ?? params.get("encounter") ?? ""
  const landingTab = route.instance === undefined ? hubTab(route.segment) : undefined
  const instanceSegment = route.instance ?? (landingTab ? undefined : route.segment)
  return {
    tab: hubTab(route.tab) ?? landingTab ?? "overview",
    instance: instanceSegment ? instanceNameFromPath(instanceSegment) : null,
    encounters: [...new Set(listed.split(",").map((name) => name.trim()).filter(Boolean))],
    realmIDs: [...new Set((params.get("realm_ids") ?? "").split(",").filter(Boolean))],
  }
}
