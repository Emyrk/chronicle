import { describe, expect, it } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { loadPanelPackage } from "./panelLoader"

const manifest = { manifest_version: 1, kind: "panel", name: "Damage", slug: "damage", entrypoint: "main.lua",
  capabilities: ["ui", "input"], streams: ["damage"], assets: [] }
const archive = (overrides: Record<string, unknown> = {}, files: Record<string, Uint8Array> = {}) =>
  zipSync({ "project.json": strToU8(JSON.stringify({ ...manifest, ...overrides })), "main.lua": strToU8("return true"), ...files })

describe("Lua panel packages", () => {
  it("loads bounded panel sources without injecting trusted modules", async () => {
    const pkg = await loadPanelPackage(archive())
    expect(pkg.streams).toEqual(["damage"])
    expect((await loadPanelPackage(archive({ streams: ["heal", "aura", "combatant_info"] }))).streams).toEqual(["heal", "aura", "combatant_info"])
    expect(pkg.sources["main.lua"]).toBe("return true")
    expect(pkg.sources["chronicle/v1/events/damage.lua"]).toBeUndefined()
  })
  it("keeps an optional README.md as text, never as a Lua source", async () => {
    expect((await loadPanelPackage(archive())).readme).toBeUndefined()
    const pkg = await loadPanelPackage(archive({}, { "README.md": strToU8("# Damage") }))
    expect(pkg.readme).toBe("# Damage")
    expect(Object.keys(pkg.sources)).toEqual(["main.lua"])
  })
  it("preserves declared capabilities for the worker", async () => {
    expect((await loadPanelPackage(archive({ capabilities: [] }))).capabilities).toEqual([])
    expect((await loadPanelPackage(archive({ capabilities: ["ui"] }))).capabilities).toEqual(["ui"])
  })
  it("rejects a reserved host module, even if the entrypoint requires it", async () => {
    await expect(loadPanelPackage(archive({}, { "chronicle/v1/ui.lua": strToU8("return {}") }))).rejects.toThrow(/reserved/)
    await expect(loadPanelPackage(archive({}, { "chronicle.v1.ui.lua": strToU8("return {}") }))).rejects.toThrow(/reserved/)
  })
  it("rejects an SVG masquerading as a declared raster asset", async () => {
    await expect(loadPanelPackage(archive({ assets: ["image.png"] }, {
      "image.png": strToU8("<svg xmlns='http://www.w3.org/2000/svg'/>")
    }))).rejects.toThrow(/asset/)
  })
  it("rejects undeclared files, unsupported capabilities and streams", async () => {
    await expect(loadPanelPackage(archive({}, { "extra.txt": strToU8("bad") }))).rejects.toThrow(/undeclared/)
    await expect(loadPanelPackage(archive({ capabilities: ["network"] }))).rejects.toThrow(/capability/)
    await expect(loadPanelPackage(archive({ streams: ["chat"] }))).rejects.toThrow(/stream/)
    await expect(loadPanelPackage(archive({ streams: ["damage", "damage"] }))).rejects.toThrow(/stream/)
  })
})
