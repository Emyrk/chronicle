import { afterEach, describe, expect, it, vi } from "vitest"
import { createGuideRequestId } from "./runtimeFactory"

afterEach(() => vi.unstubAllGlobals())

describe("guide runtime request IDs", () => {
  it("does not require crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {})

    const first = createGuideRequestId()
    const second = createGuideRequestId()

    expect(first).toMatch(/^guide-start-[a-z0-9]+-[a-z0-9]+$/)
    expect(second).not.toBe(first)
  })
})
