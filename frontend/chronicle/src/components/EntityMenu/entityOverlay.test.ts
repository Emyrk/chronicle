import { describe, expect, it, vi } from "vitest"
import { ENTITY_OVERLAY_ATTRIBUTE, setEntityOverlayOpen } from "./entityOverlay"

describe("entity overlay state", () => {
  it("marks the document root while compare or Alt context is open", () => {
    const root = {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement

    setEntityOverlayOpen(root, true)
    expect(root.setAttribute).toHaveBeenCalledWith(ENTITY_OVERLAY_ATTRIBUTE, "")

    setEntityOverlayOpen(root, false)
    expect(root.removeAttribute).toHaveBeenCalledWith(ENTITY_OVERLAY_ATTRIBUTE)
  })
})
