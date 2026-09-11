import { describe, expect, it } from "vitest"
import { subspecRulesForFlavor } from "./subspecs"

describe("subspecRulesForFlavor", () => {
  it("returns Nightmare of Ursol rules when the tenant dataset enables the flavor", () => {
    const rules = subspecRulesForFlavor(["vanilla", "nightmare-of-ursol"])

    expect(rules).toHaveLength(2)
    expect(rules[0]).toMatchObject({
      className: "Druid",
      spec: "Feral",
      detectedSubspec: "Bear",
      fallback: "Cat",
    })
    expect(rules[0].detection).toEqual(["Thick Hide", "Feral Charge", "Feral Instinct"])
    expect(rules[1]).toMatchObject({
      className: "Shaman",
      spec: "Enhancement",
      detectedSubspec: "Tank",
      fallback: "DPS",
    })
    expect(rules[1].detection).toEqual([
      "Totemic Alignment",
      "Ancestral Guardian",
      "Spirit Armor",
    ])
  })

  it("does not show Nightmare-specific rules for other tenant flavors", () => {
    expect(subspecRulesForFlavor(["vanilla"])).toEqual([])
    expect(subspecRulesForFlavor(["tbc"])).toEqual([])
    expect(subspecRulesForFlavor(["wrath"])).toEqual([])
  })
})
