import { describe, expect, it } from "vitest"
import { buildPanelUnits } from "./panelUnits"

describe("buildPanelUnits", () => {
  it("merges players over units and keeps only defined facts", () => {
    const units = buildPanelUnits(
      { "0xP1": { name: "Thrall", class: "Shaman", race: "Orc", level: 60 } },
      { "0xP1": { name: "Thrall", entry: 0 }, "0xPET": { name: "Wolf", owner: "0xP1", entry: 1863 }, "0xNPC": { entry: 12118 } },
    )
    expect(units["0xP1"]).toEqual({ guid: "0xP1", name: "Thrall", player: true, class: "SHAMAN", race: "ORC", level: 60 })
    expect(units["0xPET"]).toEqual({ guid: "0xPET", name: "Wolf", player: false, owner: "0xP1", entry: 1863 })
    expect(units["0xNPC"]).toEqual({ guid: "0xNPC", name: "0xNPC", player: false, entry: 12118 })
  })
})
