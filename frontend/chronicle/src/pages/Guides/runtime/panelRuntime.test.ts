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

  it("renders line charts from the ui helper with validated series, markers and options", () => {
    const runtime = panel(`
      local ui = require("chronicle.v1.ui")
      local chart = ui.lineChart(UIParent, "dps", {
        width = 600, height = 240, xFormat = "seconds", yFormat = "compact", curve = "step",
        area = true, xLabel = "Time", yLabel = "DPS", yMin = 0, yMax = 5000,
        markers = { { x = 30, label = "Phase 2", color = "#ffcc00" } },
        series = {
          { name = "Jaina", color = "#69ccf0", points = { {0, 0}, {5, 1200} } },
          { name = "Thrall", color = {0, 0.5, 1}, points = { { x = 0, y = 10 }, { x = 5, y = 20 } } },
        },
      })
      chart:SetYRange(nil, nil)
    `)
    const operations = runtime.start()
    expect(() => applySceneBatch(createInitialScene(), operations)).not.toThrow()
    expect(operations).toContainEqual(expect.objectContaining({ op: "create", id: "dps", kind: "line-chart" }))
    expect(operations).toContainEqual({ op: "set", id: "dps", props: { series: [
      { name: "Jaina", color: "#69ccf0", points: [{ x: 0, y: 0 }, { x: 5, y: 1200 }] },
      { name: "Thrall", color: "#0080ffff", points: [{ x: 0, y: 10 }, { x: 5, y: 20 }] },
    ] } })
    expect(operations).toContainEqual({ op: "set", id: "dps", props: { markers: [{ x: 30, label: "Phase 2", color: "#ffcc00" }] } })
    expect(operations).toContainEqual({ op: "set", id: "dps", props: { curve: "step" } })
    expect(operations).toContainEqual({ op: "set", id: "dps", props: { yMin: "auto", yMax: "auto" } })
    runtime.stop()
  })

  it.each([
    ['{ { points = {} } }', /needs a name/],
    ['{ { name = "a", points = {} }, { name = "a", points = {} } }', /used twice/],
    ['{ { name = "a", color = "red", points = {} } }', /hex color/],
    ['{ { name = "a", points = { {1} } } }', /point 1 y must be a number/],
  ])("rejects invalid line series %s", (series, error) => {
    const runtime = panel(`CreateFrame("LineChart", "c"):SetSeries(${series})`)
    expect(() => runtime.start()).toThrow(error)
    runtime.stop()
  })

  it("limits line chart points across all series", () => {
    const runtime = panel(`
      local points = {}
      for i = 1, 1001 do points[i] = { i, i } end
      CreateFrame("LineChart", "c"):SetSeries({ { name = "a", points = points }, { name = "b", points = points } })
    `)
    expect(() => runtime.start()).toThrow(/at most 2000 points/)
    runtime.stop()
  })

  it("attaches host-drawn hover text and clears it with nil", () => {
    const runtime = panel(`
      local cell = CreateFrame("Frame", "cell", UIParent)
      cell:SetTooltip("Jaina\\n1,240 DPS")
      local label = cell:CreateFontString("label")
      label:SetTooltip("hi")
      label:SetTooltip(nil)
    `)
    const operations = runtime.start()
    expect(() => applySceneBatch(createInitialScene(), operations)).not.toThrow()
    expect(operations).toContainEqual({ op: "set", id: "cell", props: { tooltipText: "Jaina\n1,240 DPS" } })
    expect(operations).toContainEqual({ op: "set", id: "label", props: { tooltipText: "" } })
    expect(() => panel(`CreateFrame("LineChart", "c"):SetTooltip("x")`).start()).toThrow(/tooltipText is not supported for line-chart/)
    runtime.stop()
  })

  it("frees descendants and their callbacks when a parent is destroyed", () => {
    const runtime = panel(`
      local root = CreateFrame("Frame", "root", UIParent)
      local row = CreateFrame("Frame", "row", root)
      row:SetScript("OnClick", function() end)
      local cell = row:CreateFontString("cell")
      local moved = CreateFrame("Frame", "moved", UIParent)
      moved:SetParent(row)
      local keep = CreateFrame("Button", "keep", UIParent)
      keep:SetScript("OnClick", function() end)
      root:Destroy()
      -- Every destroyed ID can be created again.
      CreateFrame("Frame", "row", UIParent)
      CreateFrame("Frame", "cell", UIParent)
      CreateFrame("Frame", "moved", UIParent)
    `)
    const operations = runtime.start()
    expect(() => applySceneBatch(createInitialScene(), operations)).not.toThrow()
    expect(runtime.stats()).toMatchObject({ objects: 4, callbacks: 1 })
    expect(() => runtime.event({ id: "row", event: "click" })).toThrow(/unknown callback/)
    runtime.event({ id: "keep", event: "click" })
    runtime.stop()
  })

  it("lets click handlers set and clear the page time range, and reads it back", () => {
    const runtime = panel(`
      local seen = CreateFrame("FontString", "seen", UIParent)
      local function show()
        local startMs, endMs = Chronicle.GetTimeRange()
        seen:SetText(tostring(startMs) .. "-" .. tostring(endMs))
      end
      local select = CreateFrame("Button", "select", UIParent)
      select:SetScript("OnClick", function() Chronicle.SetTimeRange(30000, 45500.4); show() end)
      local open = CreateFrame("Button", "open", UIParent)
      open:SetScript("OnClick", function() Chronicle.SetTimeRange(60000) end)
      local clear = CreateFrame("Button", "clear", UIParent)
      clear:SetScript("OnClick", function() Chronicle.ClearTimeRange(); show() end)
      local look = CreateFrame("Button", "look", UIParent)
      look:SetScript("OnClick", show)
      local backwards = CreateFrame("Button", "backwards", UIParent)
      backwards:SetScript("OnClick", function() Chronicle.SetTimeRange(5, 1) end)
    `)
    runtime.start()
    expect(runtime.takeTimeRangeRequest()).toBeUndefined()

    runtime.event({ id: "select", event: "click" })
    expect(runtime.takeTimeRangeRequest()).toEqual({ range: { startMs: 30000, endMs: 45500 } })
    expect(runtime.takeTimeRangeRequest()).toBeUndefined()
    expect(runtime.flush()).toContainEqual({ op: "set", id: "seen", props: { text: "30000-45500" } })

    runtime.event({ id: "open", event: "click" })
    expect(runtime.takeTimeRangeRequest()).toEqual({ range: { startMs: 60000, endMs: null } })

    runtime.event({ id: "clear", event: "click" })
    expect(runtime.takeTimeRangeRequest()).toEqual({ range: null })
    expect(runtime.flush()).toContainEqual({ op: "set", id: "seen", props: { text: "nil-nil" } })

    // The page's range, as pushed by the host.
    runtime.setTimeRange({ startMs: null, endMs: 9000 })
    runtime.event({ id: "look", event: "click" })
    expect(runtime.flush()).toContainEqual({ op: "set", id: "seen", props: { text: "nil-9000" } })
    expect(runtime.takeTimeRangeRequest()).toBeUndefined()

    expect(() => runtime.event({ id: "backwards", event: "click" })).toThrow(/endMs must be at least startMs/)
    runtime.stop()
  })

  it("calls OnTimeRangeChanged when the page range changes, but not for its own request", () => {
    const runtime = panel(`
      local log = CreateFrame("FontString", "log", UIParent)
      local calls = 0
      Chronicle.OnTimeRangeChanged(function(startMs, endMs)
        calls = calls + 1
        log:SetText(calls .. ":" .. tostring(startMs) .. "-" .. tostring(endMs))
      end)
      local select = CreateFrame("Button", "select", UIParent)
      select:SetScript("OnClick", function() Chronicle.SetTimeRange(1000, 2000) end)
    `)
    runtime.start()
    const texts = () => runtime.flush().filter((op) => op.op === "set" && op.id === "log").map((op) => (op as unknown as { props: { text: string } }).props.text)

    runtime.setTimeRange({ startMs: 5000, endMs: null })
    expect(texts()).toEqual(["1:5000-nil"])
    runtime.setTimeRange({ startMs: 5000, endMs: null })
    expect(texts()).toEqual([])
    runtime.setTimeRange(null)
    expect(texts()).toEqual(["2:nil-nil"])

    // The page echoes the module's own request back; that is not a change.
    runtime.event({ id: "select", event: "click" })
    runtime.setTimeRange({ startMs: 1000, endMs: 2000 })
    expect(texts()).toEqual([])
    runtime.stop()
  })

  it("does not let OnTimeRangeChanged set the range, which could loop", () => {
    const runtime = panel(`Chronicle.OnTimeRangeChanged(function() Chronicle.SetTimeRange(0, 1) end)`)
    runtime.start()
    expect(() => runtime.setTimeRange({ startMs: 10, endMs: 20 })).toThrow(/only be called from an OnClick handler/)
    runtime.stop()
  })

  it("refuses to change the time range outside a click", () => {
    for (const source of [
      `Chronicle.SetTimeRange(0, 1000)`,
      `require("chronicle.v1.events").onComplete(function() Chronicle.ClearTimeRange() end)`,
    ]) {
      const runtime = panel(source)
      expect(() => { runtime.start(); runtime.panelComplete() }).toThrow(/only be called from an OnClick handler/)
      runtime.stop()
    }
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
