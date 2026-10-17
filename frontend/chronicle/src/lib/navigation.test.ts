import { describe, expect, it, vi } from "vitest"
import { navigateWithModifiers } from "./navigation"

describe("navigateWithModifiers", () => {
  it("uses in-app navigation for an unmodified activation", () => {
    const navigate = vi.fn()
    const openNewTab = vi.fn()

    navigateWithModifiers("/instances/example", { ctrlKey: false, metaKey: false }, navigate, openNewTab)

    expect(navigate).toHaveBeenCalledWith("/instances/example")
    expect(openNewTab).not.toHaveBeenCalled()
  })

  it.each([
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true },
  ])("opens a new tab for modifier-click navigation", (modifiers) => {
    const navigate = vi.fn()
    const openNewTab = vi.fn()

    navigateWithModifiers("/instances/example", modifiers, navigate, openNewTab)

    expect(openNewTab).toHaveBeenCalledWith("/instances/example")
    expect(navigate).not.toHaveBeenCalled()
  })
})
