import { describe, expect, it } from "vitest"
import { performanceAdsSuppressed, shouldShowPerformanceSearchAd } from "./performanceAds"

describe("shouldShowPerformanceSearchAd", () => {
  it("shows the ad until enough search text is entered", () => {
    expect(shouldShowPerformanceSearchAd("")).toBe(true)
    expect(shouldShowPerformanceSearchAd(" a ")).toBe(true)
    expect(shouldShowPerformanceSearchAd("ab")).toBe(false)
  })
})

describe("performanceAdsSuppressed", () => {
  it("suppresses comparison ads when any selected player is ad-free", () => {
    expect(performanceAdsSuppressed([{ owner_ads_free: false }, { owner_ads_free: true }])).toBe(true)
  })

  it("allows comparison ads when no selected player is ad-free", () => {
    expect(performanceAdsSuppressed([{ owner_ads_free: false }, { owner_ads_free: false }])).toBe(false)
  })
})
