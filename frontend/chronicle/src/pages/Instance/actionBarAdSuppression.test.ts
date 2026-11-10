import { describe, expect, it, vi } from "vitest"
import {
  ACTION_BAR_AD_SUPPRESSION_ATTRIBUTE,
  setActionBarAdSuppression,
  shouldSuppressMobileAdForActionBar,
} from "./actionBarAdSuppression"

describe("layout action bar ad suppression", () => {
  it("suppresses mobile ads only while the visible mobile action bar is open", () => {
    expect(
      shouldSuppressMobileAdForActionBar({
        isMobile: true,
        isEncounterView: true,
        actionBarOpen: true,
        suppressActionBar: false,
      }),
    ).toBe(true)

    for (const override of [
      { isMobile: false },
      { isEncounterView: false },
      { actionBarOpen: false },
      { suppressActionBar: true },
    ]) {
      expect(
        shouldSuppressMobileAdForActionBar({
          isMobile: true,
          isEncounterView: true,
          actionBarOpen: true,
          suppressActionBar: false,
          ...override,
        }),
      ).toBe(false)
    }
  })

  it("marks and clears the document root", () => {
    const root = {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement

    setActionBarAdSuppression(root, true)
    expect(root.setAttribute).toHaveBeenCalledWith(ACTION_BAR_AD_SUPPRESSION_ATTRIBUTE, "")

    setActionBarAdSuppression(root, false)
    expect(root.removeAttribute).toHaveBeenCalledWith(ACTION_BAR_AD_SUPPRESSION_ATTRIBUTE)
  })
})
