import { describe, expect, it } from "vitest"
import { v2Selection } from "./v2Selection"

describe("hidden leaderboard v2 selection", () => {
  it("opens the live overview without selecting a mock instance", () => {
    expect(v2Selection(new URLSearchParams())).toEqual({ tab: "overview", instance: null })
  })

  it("preserves supported tabs and exact instance names in the URL", () => {
    expect(v2Selection(new URLSearchParams("tab=ratings&instance=Blackwing+Lair"))).toEqual({
      tab: "ratings", instance: "Blackwing Lair",
    })
  })

  it("falls back to the overview for unknown tabs", () => {
    expect(v2Selection(new URLSearchParams("tab=unknown&instance=Molten+Core"))).toEqual({
      tab: "overview", instance: "Molten Core",
    })
  })
})
