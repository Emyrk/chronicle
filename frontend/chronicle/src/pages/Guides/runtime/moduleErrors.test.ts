import { describe, expect, it } from "vitest"
import { explainModuleError, formatModuleError } from "./moduleErrors"

describe("explainModuleError", () => {
  it("explains UI operation overflows in onComplete with location and fixes", () => {
    const explained = explainModuleError("main.lua:151: operation limit exceeded", { phase: "onComplete" })
    expect(explained).toMatchObject({ title: "Too many UI changes at once", where: "main.lua line 151 · in onComplete", docs: "limits" })
    expect(explained.fixes.join(" ")).toMatch(/top 25/)
  })

  it("points onEvent overflows at per-event drawing and reports the event number", () => {
    const explained = explainModuleError("main.lua:20: operation limit exceeded", { phase: "onEvent", events: 1234 })
    expect(explained.where).toBe("main.lua line 20 · in onEvent (event 1,234)")
    expect(explained.detail).toMatch(/within 100 events/)
  })

  it("explains budgets, max_events, nil calls and unknown errors", () => {
    expect(explainModuleError("main.lua:3: instruction budget exceeded", { phase: "startup" }).detail).toMatch(/250,000/)
    expect(explainModuleError("panel exceeded its max_events (10)", { phase: "onEvent" })).toMatchObject({ title: "Reached the module's max_events", docs: "project-json" })
    expect(explainModuleError("main.lua:3: panel stream 'aura' is not allowed", { phase: "startup" })).toMatchObject({ title: "Stream not declared", docs: "streams-and-fields" })
    expect(explainModuleError("main.lua:9: attempt to call a nil value (method 'SetTxt')").detail).toBe("Tried to call method 'SetTxt', but it is nil.")
    expect(explainModuleError("main.lua:9: boom")).toMatchObject({ title: "Lua error", detail: "boom", fixes: ["Check main.lua around line 9."] })
  })

  it("formats a plain-text version for the assistant", () => {
    const text = formatModuleError(explainModuleError("main.lua:151: operation limit exceeded", { phase: "onComplete" }))
    expect(text).toMatch(/^Too many UI changes at once \(main\.lua line 151 · in onComplete\): /)
    expect(text).toMatch(/Original error: main\.lua:151: operation limit exceeded$/)
  })
})
