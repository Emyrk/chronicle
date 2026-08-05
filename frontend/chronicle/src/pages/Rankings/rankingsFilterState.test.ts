import { describe, expect, it } from "vitest"
import {
  groupByParamForValue,
  parseGroupByClass,
  parseHideUnknowns,
  unknownsParamForValue,
} from "./rankingsFilterState"

describe("rankings filter defaults", () => {
  it("uses spec-oriented defaults for spec-cohort tenants", () => {
    expect(parseHideUnknowns(null, "spec")).toBe(true)
    expect(parseGroupByClass(null, "spec")).toBe(false)
  })

  it("shows unknowns and merges specs for class-cohort tenants", () => {
    expect(parseHideUnknowns(null, "class")).toBe(false)
    expect(parseGroupByClass(null, "class")).toBe(true)
  })

  it("keeps explicit URL overrides", () => {
    expect(parseHideUnknowns("hide", "class")).toBe(true)
    expect(parseHideUnknowns("show", "spec")).toBe(false)
    expect(parseGroupByClass("spec", "class")).toBe(false)
    expect(parseGroupByClass("class", "spec")).toBe(true)
  })

  it("omits URL values that match the tenant default", () => {
    expect(unknownsParamForValue(false, "class")).toBeNull()
    expect(unknownsParamForValue(true, "class")).toBe("hide")
    expect(groupByParamForValue(true, "class")).toBeNull()
    expect(groupByParamForValue(false, "class")).toBe("spec")
  })
})
