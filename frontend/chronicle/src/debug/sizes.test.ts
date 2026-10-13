import { describe, expect, it } from "vitest"
import { nextSizeIndex, SIZE_GROUPS, STANDARD_SIZES } from "./sizes"

function keys(sizes: readonly { width: number; height: number }[]): string[] {
  return sizes.map((size) => `${size.width}x${size.height}`).sort()
}

describe("sizes", () => {
  it("includes each supported preview size once", () => {
    expect(keys(STANDARD_SIZES)).toEqual([
      "160x600",
      "300x250",
      "300x600",
      "320x100",
      "320x480",
      "320x50",
      "728x90",
      "970x250",
      "970x90",
    ])
  })

  it("groups sizes by format", () => {
    expect(SIZE_GROUPS.map((group) => group.label)).toEqual([
      "Anchor",
      "Article",
      "Side Rail",
      "Sticky Stack",
      "Large Leaderboard",
    ])
    expect(keys(SIZE_GROUPS.find((group) => group.label === "Side Rail")!.sizes)).toEqual([
      "160x600",
      "300x250",
      "300x600",
      "320x480",
    ])
  })

  it("cycles back to the first size", () => {
    expect(nextSizeIndex(0)).toBe(1)
    expect(nextSizeIndex(STANDARD_SIZES.length - 1)).toBe(0)
  })
})
