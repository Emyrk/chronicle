import { describe, expect, it } from "vitest"
import { performanceAdsSuppressed } from "./performanceAds"

describe("performanceAdsSuppressed", () => {
  it("suppresses comparison ads when any selected player is ad-free", () => {
    expect(performanceAdsSuppressed([{ owner_ads_free: false }, { owner_ads_free: true }])).toBe(true)
  })

  it("allows comparison ads when no selected player is ad-free", () => {
    expect(performanceAdsSuppressed([{ owner_ads_free: false }, { owner_ads_free: false }])).toBe(false)
  })
})
