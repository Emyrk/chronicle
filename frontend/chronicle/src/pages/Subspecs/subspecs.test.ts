import { describe, expect, it } from "vitest"
import { subspecRulesForFlavor } from "./subspecs"

describe("subspecRulesForFlavor", () => {
  it("returns Nightmare of Ursol rules when the tenant dataset enables the flavor", () => {
    const rules = subspecRulesForFlavor(["vanilla", "nightmare-of-ursol"])

    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ className: "Druid", spec: "Feral", fallback: "Cat" })
    expect(rules[0].detection).toEqual(["Thick Hide", "Feral Charge", "Feral Instinct"])
  })

  it("does not show Nightmare-specific rules for other tenant flavors", () => {
    expect(subspecRulesForFlavor(["vanilla"])).toEqual([])
    expect(subspecRulesForFlavor(["tbc"])).toEqual([])
    expect(subspecRulesForFlavor(["wrath"])).toEqual([])
  })
})
