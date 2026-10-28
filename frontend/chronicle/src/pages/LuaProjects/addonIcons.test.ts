import { describe, expect, it } from "vitest"
import { Blocks, HeartPulse } from "lucide-react"
import reference from "./lua-panel-api.md?raw"
import { ADDON_ICON_NAMES, ADDON_ICONS, addonIconComponent } from "./addonIcons"

describe("addon icons", () => {
  it("maps exactly the names the server accepts", () => {
    expect(Object.keys(ADDON_ICONS).sort()).toEqual([...ADDON_ICON_NAMES].sort())
    expect(new Set(ADDON_ICON_NAMES).size).toBe(ADDON_ICON_NAMES.length)
    for (const name of ADDON_ICON_NAMES) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  it("falls back to the generic addon icon", () => {
    expect(addonIconComponent("heart-pulse")).toBe(HeartPulse)
    expect(addonIconComponent(undefined)).toBe(Blocks)
    expect(addonIconComponent("toString")).toBe(Blocks)
  })

  it("lists every icon in the API reference", () => {
    for (const name of ADDON_ICON_NAMES) expect(reference).toContain(`\`${name}\``)
  })
})
