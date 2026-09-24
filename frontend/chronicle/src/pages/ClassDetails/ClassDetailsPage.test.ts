import { describe, expect, it } from "vitest"
import { hasWrathFlavor } from "./classDetails"

describe("hasWrathFlavor", () => {
  it("shows Wrath class details when the tenant dataset enables Wrath", () => {
    expect(hasWrathFlavor(["vanilla", "wrath", "azerothcore"])).toBe(true)
  })

  it("hides Wrath class details for other tenant flavors", () => {
    expect(hasWrathFlavor(["vanilla", "nightmare-of-ursol"])).toBe(false)
  })
})
