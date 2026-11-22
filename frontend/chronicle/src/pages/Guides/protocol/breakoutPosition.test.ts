import { describe, expect, it } from "vitest"
import { breakoutPosition } from "./breakoutPosition"

describe("breakoutPosition", () => {
  const viewport = { width: 1000, height: 800 }
  const size = { width: 300, height: 200 }

  it("opens to the right of the anchor when it fits", () => {
    expect(breakoutPosition({ left: 100, right: 200, top: 50, bottom: 80 }, size, viewport)).toEqual({ x: 208, y: 50 })
  })

  it("opens to the left when the right side is too narrow", () => {
    expect(breakoutPosition({ left: 600, right: 900, top: 50, bottom: 80 }, size, viewport)).toEqual({ x: 292, y: 50 })
  })

  it("opens below a wide anchor, kept inside the viewport", () => {
    expect(breakoutPosition({ left: 20, right: 980, top: 700, bottom: 730 }, size, viewport)).toEqual({ x: 20, y: 592 })
  })
})
