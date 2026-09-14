import { describe, expect, it } from "vitest"
import { formatBoxPlotTick, getBoxPlotScale } from "./boxPlotScale"

describe("getBoxPlotScale", () => {
  it("keeps large distributions to a readable number of ticks", () => {
    expect(getBoxPlotScale(20_400)).toEqual({
      max: 25_000,
      values: [0, 5_000, 10_000, 15_000, 20_000, 25_000],
    })
  })

  it("uses smaller nice intervals for compact distributions", () => {
    expect(getBoxPlotScale(4_971)).toEqual({
      max: 5_000,
      values: [0, 1_000, 2_000, 3_000, 4_000, 5_000],
    })
  })

  it("falls back to a useful default for invalid data", () => {
    expect(getBoxPlotScale(0)).toEqual({
      max: 1_200,
      values: [0, 200, 400, 600, 800, 1_000, 1_200],
    })
  })
})

describe("formatBoxPlotTick", () => {
  it("compacts thousands without obscuring smaller values", () => {
    expect(formatBoxPlotTick(800)).toBe("800")
    expect(formatBoxPlotTick(1_000)).toBe("1k")
    expect(formatBoxPlotTick(12_500)).toBe("12.5k")
  })
})
