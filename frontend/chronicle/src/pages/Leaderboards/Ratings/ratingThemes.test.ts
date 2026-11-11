import { describe, expect, it } from "vitest"
import { specIconUrl } from "./ratingThemes"

describe("specIconUrl", () => {
  it("normalizes the Wrath database class identifier to the bundled icon name", () => {
    expect(specIconUrl("DEATH_KNIGHT", "Blood")).toBe("/c/icons/spec_deathknight_blood.png")
  })
})
