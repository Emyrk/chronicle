import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/api/queries"
import { latestRelease, listStarredProjects, type LuaChannel } from "../../../LuaProjects/api"

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
  /** The latest release with files: what the panel runs by default. */
  release?: { tag: string; sha256: string; icon?: string }
  main?: { sha256: string; icon?: string }
}

/** Panel addons the user tracks (stars; owners always do), with a release or a saved main. */
export async function fetchTrackedLuaPanels(): Promise<LuaProjectCatalogEntry[]> {
  const projects = await listStarredProjects()
  return projects.flatMap(project => {
    const latest = latestRelease(project)
    if (project.kind !== "panel" || !parseLuaPanelRef(luaPanelRef(project.id, "release")) || (!latest && !project.main)) return []
    return [{ id: project.id, kind: project.kind, name: project.name,
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
      if (!ownerId) throw new Error("Sign in to view your addons")
      return fetchTrackedLuaPanels()
    },
  })
}
