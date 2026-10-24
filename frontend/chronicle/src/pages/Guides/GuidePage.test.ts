import { describe, expect, it } from "vitest"
import { assertGuideCompatibility, expectedGuideGame } from "./guideCompatibility"

describe("guide tenant compatibility", () => {
  it("maps tenant server names to package game identifiers", () => {
    expect(expectedGuideGame("turtle")).toBe("turtle-wow")
    expect(expectedGuideGame("epoch")).toBe("epoch-wow")
  })

  it("rejects packages authored for another game tenant", () => {
    expect(() => assertGuideCompatibility("turtle-wow", "turtle")).not.toThrow()
    expect(() => assertGuideCompatibility("epoch-wow", "turtle")).toThrow(/tenant runs turtle-wow/)
  })
})
