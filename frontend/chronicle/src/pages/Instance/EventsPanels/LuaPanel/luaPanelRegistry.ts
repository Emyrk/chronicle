import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/api/queries"
import { listProjects } from "../../../LuaProjects/api"

export type LuaPanelRef = `lua:${string}:${"stable" | "unstable"}`
const REF = /^lua:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(stable|unstable)$/i

export function parseLuaPanelRef(value: string): { id: string; channel: "stable" | "unstable" } | null {
  const match = REF.exec(value)
  return match ? { id: match[1].toLowerCase(), channel: match[2].toLowerCase() as "stable" | "unstable" } : null
}

export function isLuaPanelRef(value: string): value is LuaPanelRef { return parseLuaPanelRef(value) !== null }

export interface LuaProjectCatalogEntry {
  id: string
  kind: "panel" | "guide"
  name: string
  stable?: { sha256: string }
  unstable?: { sha256: string }
}

export async function fetchOwnedLuaPanels(ownerId: string): Promise<LuaProjectCatalogEntry[]> {
  const projects = await listProjects()
  return projects.filter(project => project.owner_id === ownerId && project.kind === "panel" &&
    !!parseLuaPanelRef(`lua:${project.id}:stable`) && (project.stable || project.unstable))
    .map(project => ({ id: project.id, kind: project.kind, name: project.name,
      stable: project.stable ?? undefined, unstable: project.unstable ?? undefined }))
}

export function useLuaPanelCatalog(enabled = true) {
  const { data: session } = useSession()
  const ownerId = session?.user_id
  return useQuery({
    queryKey: ["lua-panel-catalog", ownerId], enabled: enabled && !!ownerId, staleTime: 60_000,
    queryFn: () => {
      if (!ownerId) throw new Error("Sign in to view your Lua panels")
      return fetchOwnedLuaPanels(ownerId)
    },
  })
}
