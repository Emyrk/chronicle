import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/api/queries"
import { latestRelease, listPublicProjects, listStarredProjects, type LuaChannel, type LuaProject } from "../../../LuaProjects/api"

export type LuaPanelRef = `lua:${string}:${LuaChannel}`
// Saved layouts may still say stable or unstable, from before releases; they mean release and main.
const REF = /^lua:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(release|main|stable|unstable)$/i
const LEGACY_CHANNELS: Readonly<Record<string, LuaChannel>> = { stable: "release", unstable: "main" }

export function parseLuaPanelRef(value: string): { id: string; channel: LuaChannel } | null {
  const match = REF.exec(value)
  if (!match) return null
  const channel = match[2].toLowerCase()
  return { id: match[1].toLowerCase(), channel: LEGACY_CHANNELS[channel] ?? channel as LuaChannel }
}

export function luaPanelRef(id: string, channel: LuaChannel): LuaPanelRef { return `lua:${id}:${channel}` }

export function isLuaPanelRef(value: string): value is LuaPanelRef { return parseLuaPanelRef(value) !== null }

export interface LuaProjectCatalogEntry {
  id: string
  kind: "panel" | "guide"
  name: string
  author?: string
  description: string
  stars: number
  /** The latest release with files: what the panel runs by default. */
  release?: { tag: string; sha256: string; icon?: string }
  main?: { sha256: string; icon?: string }
}

/** Panel modules the user tracks (stars; owners always do), with a release or a saved main. */
export async function fetchTrackedLuaPanels(): Promise<LuaProjectCatalogEntry[]> {
  const projects = await listStarredProjects()
  return projects.flatMap(project => {
    const latest = latestRelease(project)
    if (project.kind !== "panel" || !parseLuaPanelRef(luaPanelRef(project.id, "release")) || (!latest && !project.main)) return []
    return [{ id: project.id, kind: project.kind, name: project.name, author: project.author, description: project.description, stars: project.stars,
      ...(latest?.sha256 && { release: { tag: latest.tag, sha256: latest.sha256, icon: latest.icon } }),
      ...(project.main && { main: { sha256: project.main.sha256, icon: project.main.icon } }) }]
  })
}

export function useLuaPanelCatalog(enabled = true) {
  const { data: session } = useSession()
  const ownerId = session?.user_id
  return useQuery({
    queryKey: ["lua-panel-catalog", ownerId], enabled: enabled && !!ownerId, staleTime: 60_000,
    queryFn: () => {
      if (!ownerId) throw new Error("Sign in to view your modules")
      return fetchTrackedLuaPanels()
    },
  })
}

/** A module's name as pickers show it: author/name, or just the name until its owner claims an author name. */
export function moduleDisplayName(project: { author?: string; name: string }): string {
  return project.author ? `${project.author}/${project.name}` : project.name
}

/** One module panel a picker can choose. */
export interface LuaPanelOption {
  ref: LuaPanelRef
  label: string
  icon?: string
  description: string
  stars: number
}

/** Tracked modules as picker choices: the release, plus main (labelled so) when there is one. */
export function trackedLuaPanelOptions(catalog: readonly LuaProjectCatalogEntry[]): LuaPanelOption[] {
  return catalog.flatMap(project => (["release", "main"] as const).filter(channel => project[channel]).map(channel => ({
    ref: luaPanelRef(project.id, channel), icon: project[channel]?.icon, description: project.description, stars: project.stars,
    label: channel === "release" ? moduleDisplayName(project) : `${moduleDisplayName(project)} (main)`,
  })))
}

/** Released public panel modules as picker choices, in the server's most-tracked order. */
export function publicLuaPanelOptions(projects: readonly LuaProject[]): LuaPanelOption[] {
  return projects.flatMap(project => {
    const latest = latestRelease(project)
    if (project.kind !== "panel" || !latest?.sha256) return []
    return [{ ref: luaPanelRef(project.id, "release"), icon: latest.icon, label: moduleDisplayName(project), description: project.description, stars: project.stars }]
  })
}

/** Every released public module, for the panel explorer. Shares the /modules gallery's cache. */
export function usePublicLuaPanels(enabled = true) {
  return useQuery({ queryKey: ["public-modules"], enabled, staleTime: 60_000, queryFn: ({ signal }) => listPublicProjects(signal) })
}
