import { describe, expect, it } from "vitest"
import { replayDebounceError } from "./panelEvents"

describe("replayDebounceError", () => {
  it("accepts an omitted value or an integer from 0 to 5000 with incremental replay", () => {
    for (const value of [undefined, 0, 250, 5000]) expect(replayDebounceError("incremental", value)).toBeNull()
    expect(replayDebounceError(undefined, undefined)).toBeNull()
  })

  it("rejects values outside the range and non-incremental replays", () => {
    for (const value of [-1, 5001, 1.5, "250", null]) expect(replayDebounceError("incremental", value)).toMatch(/0 to 5000/)
    for (const replay of ["full", undefined]) expect(replayDebounceError(replay, 250)).toMatch(/only applies/)
  })
})
