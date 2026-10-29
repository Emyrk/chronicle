import { describe, expect, it } from "vitest"
import { Blocks, HeartPulse } from "lucide-react"
import reference from "./lua-panel-api.md?raw"
import { MODULE_ICON_NAMES, MODULE_ICONS, moduleIconComponent } from "./moduleIcons"

describe("module icons", () => {
  it("maps exactly the names the server accepts", () => {
    expect(Object.keys(MODULE_ICONS).sort()).toEqual([...MODULE_ICON_NAMES].sort())
    expect(new Set(MODULE_ICON_NAMES).size).toBe(MODULE_ICON_NAMES.length)
    for (const name of MODULE_ICON_NAMES) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  it("falls back to the generic module icon", () => {
    expect(moduleIconComponent("heart-pulse")).toBe(HeartPulse)
    expect(moduleIconComponent(undefined)).toBe(Blocks)
    expect(moduleIconComponent("toString")).toBe(Blocks)
  })

  it("lists every icon in the API reference", () => {
    for (const name of MODULE_ICON_NAMES) expect(reference).toContain(`\`${name}\``)
  })
})
