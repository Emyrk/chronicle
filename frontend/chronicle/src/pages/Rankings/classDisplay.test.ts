import { describe, expect, it } from "vitest"
import { CLASS_CSS_VAR, CLASS_DISPLAY, SPEC_BY_CLASS, classNameToId } from "./classDisplay"

describe("classNameToId", () => {
  it.each([
    ["DEATHKNIGHT", 6],
    ["Death Knight", 6],
    ["DEATH_KNIGHT", 6],
    ["death-knight", 6],
    ["WARRIOR", 1],
    ["Warrior", 1],
  ])("resolves %s", (className, expected) => {
    expect(classNameToId(className)).toBe(expected)
  })

  it("returns undefined for an unknown class", () => {
    expect(classNameToId("UNKNOWN")).toBeUndefined()
  })
})

describe("Death Knight display metadata", () => {
  it("supports the database class identifier used by Wrath leaderboards", () => {
    expect(CLASS_DISPLAY.DEATH_KNIGHT).toBe("Death Knight")
    expect(CLASS_CSS_VAR.DEATH_KNIGHT).toBe("var(--color-class-deathknight)")
    expect(SPEC_BY_CLASS.DEATH_KNIGHT).toEqual(["Blood", "Frost", "Unholy"])
  })
})
