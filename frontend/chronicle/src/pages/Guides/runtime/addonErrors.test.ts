import { describe, expect, it } from "vitest"
import { explainAddonError, formatAddonError } from "./addonErrors"

describe("explainAddonError", () => {
  it("explains UI operation overflows in onComplete with location and fixes", () => {
    const explained = explainAddonError("main.lua:151: operation limit exceeded", { phase: "onComplete" })
    expect(explained).toMatchObject({ title: "Too many UI changes at once", where: "main.lua line 151 · in onComplete", docs: "limits" })
    expect(explained.fixes.join(" ")).toMatch(/top 25/)
  })

  it("points onEvent overflows at per-event drawing and reports the event number", () => {
    const explained = explainAddonError("main.lua:20: operation limit exceeded", { phase: "onEvent", events: 1234 })
    expect(explained.where).toBe("main.lua line 20 · in onEvent (event 1,234)")
    expect(explained.detail).toMatch(/within 100 events/)
  })

  it("explains budgets, max_events, nil calls and unknown errors", () => {
    expect(explainAddonError("main.lua:3: instruction budget exceeded", { phase: "startup" }).detail).toMatch(/250,000/)
    expect(explainAddonError("panel exceeded its max_events (10)", { phase: "onEvent" })).toMatchObject({ title: "Reached the addon's max_events", docs: "project-json" })
    expect(explainAddonError("main.lua:9: attempt to call a nil value (method 'SetTxt')").detail).toBe("Tried to call method 'SetTxt', but it is nil.")
    expect(explainAddonError("main.lua:9: boom")).toMatchObject({ title: "Lua error", detail: "boom", fixes: ["Check main.lua around line 9."] })
  })

  it("formats a plain-text version for the assistant", () => {
    const text = formatAddonError(explainAddonError("main.lua:151: operation limit exceeded", { phase: "onComplete" }))
    expect(text).toMatch(/^Too many UI changes at once \(main\.lua line 151 · in onComplete\): /)
    expect(text).toMatch(/Original error: main\.lua:151: operation limit exceeded$/)
  })
})
