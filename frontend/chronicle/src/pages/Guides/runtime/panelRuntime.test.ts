import { describe, expect, it } from "vitest"
import { applySceneBatch, createInitialScene } from "../protocol/scene"
import { createGuideRuntime } from "./runtime"

function panel(source: string, sources: Record<string, string> = {}) {
  return createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": source, ...sources },
    capabilities: ["ui", "input"], panelStreams: ["damage"] })
}

describe("safe panel profile", () => {
  it("loads host libraries on demand without bundling them into uploaded sources", () => {
    const runtime = panel(`
      assert(Map == nil and C_Timer == nil and fetch == nil and js == nil)
      local ui = require("chronicle.v1.ui")
      ui.metric(UIParent, "metric", "Damage", 5, 0, 0)
      ui.table(UIParent, "table", {{"Alice", 5}}, 0, -70)
      ui.bars(UIParent, "bars", {{"Alice", 5}}, 0, -100)
    `)
    const operations = runtime.start()
    expect(() => applySceneBatch(createInitialScene(), operations)).not.toThrow()
    expect(operations).toContainEqual(expect.objectContaining({ op: "create", id: "metric" }))
    runtime.stop()
  })

  it("rejects uploaded reserved names and unknown Chronicle modules", () => {
    expect(() => panel(``, { "chronicle/v1/ui.lua": "return {}" })).toThrow(/reserved/)
    const runtime = panel(`require("chronicle.v1.other")`)
    expect(() => runtime.start()).toThrow(/not found/)
    runtime.stop()
  })

  it("dispatches only bounded host-allowlisted event projections", () => {
    const runtime = panel(`
      local label = CreateFrame("FontString", "amount", UIParent)
      local damage = require("chronicle.v1.events.damage")
      damage.bySource(function(source, total) label:SetText(source .. ":" .. total) end)
    `)
    runtime.start()
    const event = { stream: "damage", source: "A", target: "B", amount: 42, offsetMs: 0, encounterId: "e1", selected: true }
    expect(() => runtime.panelEvent({ ...event, stream: "heal" })).toThrow(/disallowed/)
    expect(() => runtime.panelEvent({ ...event, secret: "x" })).toThrow(/disallowed/)
    expect(() => runtime.panelEvent({ ...event, selected: "yes" })).toThrow(/disallowed/)
    runtime.panelEvent(event)
    expect(runtime.flush()).toContainEqual({ op: "set", id: "amount", props: { text: "A:42.0" } })
    runtime.stop()
  })

  it("passes encounter tags to Lua and calls onComplete once the host finishes", () => {
    const runtime = panel(`
      local label = CreateFrame("FontString", "amount", UIParent)
      local damage = require("chronicle.v1.events.damage")
      local total, seen = 0, {}
      damage.onEvent(function(event)
        if event.selected then total = total + event.amount end
        seen[#seen + 1] = event.encounterId
      end)
      damage.onComplete(function() label:SetText(total .. " " .. table.concat(seen, ",")) end)
    `)
    runtime.start()
    runtime.panelEvent({ stream: "damage", source: "A", target: "B", amount: 5, offsetMs: 0, encounterId: "e1", selected: true })
    runtime.panelEvent({ stream: "damage", source: "A", target: "B", amount: 7, offsetMs: 0, encounterId: "e2", selected: false })
    expect(runtime.flush()).not.toContainEqual(expect.objectContaining({ op: "set", id: "amount" }))
    runtime.panelComplete()
    expect(runtime.flush()).toContainEqual({ op: "set", id: "amount", props: { text: "5.0 e1,e2" } })
    runtime.stop()
  })
})
