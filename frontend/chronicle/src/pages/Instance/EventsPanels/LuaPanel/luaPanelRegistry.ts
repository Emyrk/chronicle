import { useQuery } from "@tanstack/react-query"

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

export function useLuaPanelCatalog(enabled = true) {
  return useQuery({ queryKey: ["lua-panel-catalog"], enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<LuaProjectCatalogEntry[]> => {
      const response = await fetch("/api/v1/lua-projects", { signal })
      if (!response.ok) throw new Error("Lua panel catalog unavailable")
      const value: unknown = await response.json()
      if (!Array.isArray(value)) throw new Error("Invalid Lua panel catalog")
      return value.filter((item): item is LuaProjectCatalogEntry => !!item && typeof item === "object" &&
        item.kind === "panel" && typeof item.id === "string" && !!parseLuaPanelRef(`lua:${item.id}:stable`) && typeof item.name === "string")
    },
  })
}
