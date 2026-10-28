import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchOwnedLuaPanels, luaPanelRef, parseLuaPanelRef } from "./luaPanelRegistry"

const id = (suffix: string) => `00000000-0000-4000-8000-00000000000${suffix}`
const release = (tag: string, available = true) => ({ tag, available, ...(available && { sha256: `${tag}-sha`, icon: "swords" }), published_at: "2026-10-01T00:00:00Z" })
const main = { sha256: "main-sha", icon: "zap", updated_at: "2026-10-27T00:00:00Z" }

describe("Lua panel discovery", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("lists panels the user owns or was given access to that have a release or a saved main", async () => {
    const projects = [
      { id: id("1"), owner_id: "me", kind: "panel", name: "Released", releases: [release("v2", false), release("v1")], main },
      { id: id("2"), owner_id: "me", kind: "panel", name: "Main only", releases: [], main },
      // The server lists only addons the user owns or contributes to, so a shared one appears too.
      { id: id("3"), owner_id: "other", kind: "panel", name: "Shared", releases: [release("1.0")] },
      { id: id("4"), owner_id: "me", kind: "panel", name: "Empty", releases: [release("v1", false)] },
      { id: id("5"), owner_id: "me", kind: "guide", name: "Guide", releases: [release("v1")], main },
    ]
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ projects }) })
    vi.stubGlobal("fetch", fetch)

    const panels = await fetchOwnedLuaPanels()
    expect(panels.map(project => project.id)).toEqual([id("1"), id("2"), id("3")])
    expect(panels[0].release).toEqual({ tag: "v1", sha256: "v1-sha", icon: "swords" })
    expect(panels[1].release).toBeUndefined()
    expect(panels[1].main).toEqual({ sha256: "main-sha", icon: "zap" })
    expect(fetch).toHaveBeenCalledWith("/api/v1/me/lua-projects", { credentials: "include" })
  })

  it("reads saved stable and unstable references as release and main", () => {
    expect(parseLuaPanelRef(`lua:${id("1")}:stable`)).toEqual({ id: id("1"), channel: "release" })
    expect(parseLuaPanelRef(`lua:${id("1")}:unstable`)).toEqual({ id: id("1"), channel: "main" })
    expect(parseLuaPanelRef(luaPanelRef(id("1"), "main"))).toEqual({ id: id("1"), channel: "main" })
    expect(parseLuaPanelRef(`lua:${id("1")}:beta`)).toBeNull()
  })
})
