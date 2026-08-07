import { describe, expect, it } from "vitest"
import { canContinueWizard, nextCompletedWizardStep } from "./wizard"

const empty = { videoReady: false, captureReady: false, clockReady: false, syncReady: false }

describe("YouTube Sync V3 wizard", () => {
  it("requires completion of the active step", () => {
    expect(canContinueWizard(1, empty)).toBe(false)
    expect(canContinueWizard(1, { ...empty, videoReady: true })).toBe(true)
    expect(canContinueWizard(2, { ...empty, captureReady: true })).toBe(true)
  })

  it("advances only one completed step at a time", () => {
    expect(nextCompletedWizardStep(1, { ...empty, videoReady: true })).toBe(2)
    expect(nextCompletedWizardStep(2, { ...empty, captureReady: true })).toBe(3)
    expect(nextCompletedWizardStep(3, empty)).toBe(3)
    expect(nextCompletedWizardStep(4, { ...empty, syncReady: true })).toBe(5)
  })
})
