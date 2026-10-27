import { describe, expect, it } from "vitest"
import { clampSideWidth, MIN_MAIN_WIDTH, MIN_SIDE_WIDTH } from "./paneWidth"

describe("clampSideWidth", () => {
  it("keeps both workshop columns usable", () => {
    expect(clampSideWidth(500, 1600)).toBe(500)
    expect(clampSideWidth(100, 1600)).toBe(MIN_SIDE_WIDTH)
    expect(clampSideWidth(1500, 1600)).toBe(1600 - MIN_MAIN_WIDTH)
    expect(clampSideWidth(480.6, 1600)).toBe(481)
  })
})
