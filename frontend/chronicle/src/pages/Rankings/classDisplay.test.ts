import { describe, expect, it } from "vitest"
import { classNameToId } from "./classDisplay"

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
