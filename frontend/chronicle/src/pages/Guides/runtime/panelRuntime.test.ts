import { describe, expect, it } from "vitest"
import { applySceneBatch, createInitialScene } from "../protocol/scene"
import { createGuideRuntime } from "./runtime"
import type { PanelUnits } from "./panelUnits"

function panel(source: string, sources: Record<string, string> = {}, units?: PanelUnits) {
  return createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": source, ...sources },
    capabilities: ["ui", "input"], panelStreams: ["damage"], units })
}

describe("safe panel profile", () => {
  it("loads host libraries on demand without bundling them into uploaded sources", () => {
    const runtime = panel(`
      assert(Map == nil and C_Timer == nil and fetch == nil and js == nil)
      local ui = require("chronicle.v1.ui")
      ui.metric(UIParent, "metric", "Damage", 5, 0, 0)
      ui.table(UIParent, "table", {{"Alice", 5}}, 0, -70)
      ui.bars(UIParent, "bars", {{"Alice", 5}}, 0, -100)
      local chart = ui.playerMetricChart(UIParent, "chart", {
        type = "damage", perSecond = true, durationMillis = 60000,
        panelTitle = "Damage Done", width = 480, height = 320,
      })
      chart:SetData({{ playerID = "p1", playerName = "Alice", className = "mage", value = 120000 }})
    `)
    const operations = runtime.start()
    expect(() => applySceneBatch(createInitialScene(), operations)).not.toThrow()
    expect(operations).toContainEqual(expect.objectContaining({ op: "create", id: "metric" }))
    expect(operations).toContainEqual(expect.objectContaining({ op: "create", id: "chart", kind: "player-metric-chart" }))
    expect(operations).toContainEqual({ op: "set", id: "chart", props: { data: [{ playerID: "p1", playerName: "Alice", className: "MAGE", specialization: "", value: 120000 }] } })
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
    expect(runtime.flush()).toContainEqual({ op: "set", id: "amount", props: { text: "A:42" } })
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
    expect(runtime.flush()).toContainEqual({ op: "set", id: "amount", props: { text: "5 e1,e2" } })
    runtime.stop()
  })

  it("looks up units and lists players through Chronicle", () => {
    const runtime = panel(`
      local label = CreateFrame("FontString", "out", UIParent)
      local thrall = Chronicle.GetUnit("0xP1")
      local wolf = Chronicle.GetUnit("0xPET")
      local owner = Chronicle.GetUnit(wolf.owner)
      assert(Chronicle.GetUnit("0xMISSING") == nil)
      label:SetText(thrall.name .. " " .. thrall.class .. " " .. thrall.race .. " " .. tostring(thrall.player) .. " | " ..
        wolf.name .. " " .. wolf.entry .. " " .. owner.name .. " | " .. table.concat(Chronicle.GetPlayers(), ","))
    `, {}, {
      "0xP1": { guid: "0xP1", name: "Thrall", player: true, class: "SHAMAN", race: "ORC", level: 60 },
      "0xP2": { guid: "0xP2", name: "Jaina", player: true, class: "MAGE" },
      "0xPET": { guid: "0xPET", name: "Wolf", player: false, owner: "0xP1", entry: 1863 },
    })
    expect(runtime.start()).toContainEqual({ op: "set", id: "out", props: { text: "Thrall SHAMAN ORC true | Wolf 1863 Thrall | 0xP2,0xP1" } })
    runtime.stop()
  })
})
