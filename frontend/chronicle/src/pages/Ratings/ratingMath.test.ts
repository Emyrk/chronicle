import { describe, expect, it } from "vitest"
import { averageAcrossBosses, bandFor, ratePlayerBoss } from "./ratingMath"

describe("bandFor", () => {
  it("splits ten kills into 2 ignored, 2 floor, 5 form, 1 peak", () => {
    const bands = Array.from({ length: 10 }, (_, i) => bandFor(i + 1, 10))
    expect(bands).toEqual(["ignored", "ignored", "floor", "floor", "form", "form", "form", "form", "form", "peak"])
  })
})

describe("ratePlayerBoss", () => {
  it("reaches the 30/80/100 ceilings with one, two, and three perfect kills", () => {
    expect(ratePlayerBoss([100], 100).mastery).toBeCloseTo(30)
    expect(ratePlayerBoss([100, 100], 100).mastery).toBeCloseTo(80)
    expect(ratePlayerBoss([100, 100, 100], 100).mastery).toBeCloseTo(100)
  })

  it("averages raw bands before normalizing", () => {
    const r = ratePlayerBoss([1000, 820, 1120, 1080, 1060, 1150, 1090, 1130, 1070, 1140], 1180)
    expect(r.rawPeak).toBe(1150)
    expect(r.rawFloor).toBe(1065)
    expect(r.rawForm).toBe(1112)
    expect(r.mastery).toBeCloseTo(0.3 * (115000 / 1180) + 0.5 * (111200 / 1180) + 0.2 * (106500 / 1180))
  })

  it("scores zero against a zero benchmark", () => {
    expect(ratePlayerBoss([0], 0).peak).toBe(0)
  })
})

describe("averageAcrossBosses", () => {
  it("counts missing bosses as zero", () => {
    expect(averageAcrossBosses([90, 60, null])).toBe(50)
  })
})
