import { describe, expect, it } from "vitest"
import { shouldShowInstanceAdRail } from "./instanceAdRail"

describe("shouldShowInstanceAdRail", () => {
  it("shows the rail for a non-supporter viewing a non-supporter upload", () => {
    expect(
      shouldShowInstanceAdRail({
        adsEnabled: true,
        focused: false,
        ownerAdsFree: false,
        viewerAdsFree: false,
      }),
    ).toBe(true)
  })

  it("reclaims the rail when advertising is disabled for the deployment", () => {
    expect(
      shouldShowInstanceAdRail({
        adsEnabled: false,
        focused: false,
        ownerAdsFree: false,
        viewerAdsFree: false,
      }),
    ).toBe(false)
  })

  it("reclaims the rail when the upload owner is ad-free", () => {
    expect(
      shouldShowInstanceAdRail({
        adsEnabled: true,
        focused: false,
        ownerAdsFree: true,
        viewerAdsFree: false,
      }),
    ).toBe(false)
  })

  it("reclaims the rail when the viewer is ad-free", () => {
    expect(
      shouldShowInstanceAdRail({
        adsEnabled: true,
        focused: false,
        ownerAdsFree: false,
        viewerAdsFree: true,
      }),
    ).toBe(false)
  })

  it("hides the rail in focus mode", () => {
    expect(
      shouldShowInstanceAdRail({
        adsEnabled: true,
        focused: true,
        ownerAdsFree: false,
        viewerAdsFree: false,
      }),
    ).toBe(false)
  })
})
