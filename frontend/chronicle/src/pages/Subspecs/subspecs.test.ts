import { describe, expect, it } from "vitest"
import { subspecRulesForFlavor } from "./subspecs"

describe("subspecRulesForFlavor", () => {
  it("returns Nightmare of Ursol rules when the tenant dataset enables the flavor", () => {
    const rules = subspecRulesForFlavor(["vanilla", "nightmare-of-ursol"])

    expect(rules).toHaveLength(3)
    expect(rules[0]).toMatchObject({
      className: "Druid",
      spec: "Feral",
      detectedSubspec: "Bear",
      fallback: "Cat",
    })
    expect(rules[0].subspecs).toEqual([
      expect.objectContaining({ name: "Bear", description: expect.stringContaining("more than 51%") }),
      expect.objectContaining({ name: "Cat", description: expect.stringContaining("more than 51%") }),
    ])
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
    expect(rules[2]).toMatchObject({
      className: "Warrior",
      spec: "Fury",
      detectedSubspec: "Fury Prot",
      fallback: "",
    })
    expect(rules[2].detection).toEqual(["Defiance", "Bloodthirst"])
  })

  it("does not show Nightmare-specific rules for other tenant flavors", () => {
    expect(subspecRulesForFlavor(["vanilla"])).toEqual([])
    expect(subspecRulesForFlavor(["tbc"])).toEqual([])
    expect(subspecRulesForFlavor(["wrath"])).toEqual([])
  })
})
