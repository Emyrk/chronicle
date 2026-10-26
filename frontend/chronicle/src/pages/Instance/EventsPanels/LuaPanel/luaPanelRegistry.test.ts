import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchOwnedLuaPanels } from "./luaPanelRegistry"

const id = (suffix: string) => `00000000-0000-4000-8000-00000000000${suffix}`

describe("owned Lua panel discovery", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("lists only published panels owned by the signed-in user", async () => {
    const projects = [
      { id: id("1"), owner_id: "me", kind: "panel", name: "Stable", stable: { sha256: "a" }, unstable: null },
      { id: id("2"), owner_id: "me", kind: "panel", name: "Testing", stable: null, unstable: { sha256: "b" } },
      { id: id("3"), owner_id: "other", kind: "panel", name: "Other", stable: { sha256: "c" }, unstable: null },
      { id: id("4"), owner_id: "me", kind: "panel", name: "Draft", stable: null, unstable: null },
      { id: id("5"), owner_id: "me", kind: "guide", name: "Guide", stable: { sha256: "d" }, unstable: null },
    ]
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ projects }) })
    vi.stubGlobal("fetch", fetch)

    expect((await fetchOwnedLuaPanels("me")).map(project => project.id)).toEqual([id("1"), id("2")])
    expect(fetch).toHaveBeenCalledWith("/api/v1/me/lua-projects", { credentials: "include" })
  })
})
