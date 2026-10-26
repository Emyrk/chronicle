import { describe, expect, it } from "vitest"
import { assertGuideCompatibility, expectedGuideGame } from "./guideCompatibility"
import catalog from "../../../public/guides/catalog.json"
import { BUILTIN_GUIDES } from "./GuidePage"

describe("built-in guide routes", () => {
  it("resolves every catalog id and alias to its generated package", () => {
    for (const guide of catalog.guides) {
      for (const id of [guide.id, ...guide.aliases]) expect(BUILTIN_GUIDES[id]).toBe(guide.package_url)
    }
  })
})

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
