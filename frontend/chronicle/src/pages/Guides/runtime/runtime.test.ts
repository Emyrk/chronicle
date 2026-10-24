import { describe, expect, it, vi } from "vitest"
import { parseWorkerMessage } from "../protocol/protocol"
import { applySceneBatch, createInitialScene, UI_ROOT_ID } from "../protocol/scene"
import type { SceneOperation } from "../protocol/types"
import { GuideLuaError, createGuideRuntime } from "./runtime"

function run(source: string, modules: Record<string, string> = {}) {
  const batches: SceneOperation[][] = []
  const timers: Array<{ id: number; delayMs: number }> = []
  const runtime = createGuideRuntime({
    entrypoint: "main.lua", sources: { "main.lua": source, ...modules },
    emitBatch: (batch) => batches.push(batch), scheduleTimer: (id, delayMs) => timers.push({ id, delayMs }),
  })
  runtime.start()
  return { runtime, operations: batches.flat(), timers }
}

function expectValid(operations: SceneOperation[]) {
  const message = parseWorkerMessage({ type: "batch", batchId: "test", operations })
  if (message.type !== "batch") throw new Error("expected batch")
  expect(() => applySceneBatch(createInitialScene(), message.operations)).not.toThrow()
}

describe("guide Lua runtime", () => {
  it("executes a fresh state and emits protocol-valid WoW-style UI operations", () => {
    const first = run(`
      local frame = CreateFrame("Frame", "intro", UIParent)
      frame:SetPoint("CENTER", UIParent, "CENTER", 10, -5)
      frame:SetSize(320, 80)
      frame:SetAlpha(0.75)
      frame:SetBackgroundColor(0.1, 0.2, 0.3, 1)
      local label = frame:CreateFontString("title")
      label:SetText("Welcome")
      label:SetFontSize(20)
      label:SetColor(1, 0.8, 0.2, 1)
      frame:Show()
      assert(frame:IsShown())
    `)
    expect(first.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "create", id: "intro", kind: "frame", parentId: UI_ROOT_ID }),
      expect.objectContaining({ op: "set", id: "intro", props: { width: 320, height: 80 } }),
      expect.objectContaining({ op: "create", id: "title", kind: "text", parentId: "intro" }),
      expect.objectContaining({ op: "set", id: "title", props: { text: "Welcome" } }),
    ]))
    expectValid(first.operations)
    const second = run(`assert(_G.intro == nil)`)
    second.runtime.stop(); first.runtime.stop()
  })

  it("removes unsafe globals and exposes no browser or JavaScript escape", () => {
    const { runtime } = run(`
      local removed = {"io", "os", "package", "debug", "coroutine", "dofile", "loadfile", "load", "collectgarbage", "fengari", "js", "window", "document", "fetch", "XMLHttpRequest", "WebSocket"}
      for _, name in ipairs(removed) do assert(_G[name] == nil, name .. " was exposed") end
    `)
    runtime.stop()
  })

  it("exposes only APIs covered by declared capabilities", () => {
    const noCapabilities = createGuideRuntime({
      entrypoint: "main.lua",
      sources: { "main.lua": `assert(UIParent == nil and CreateFrame == nil and Map == nil and C_Timer == nil)` },
      capabilities: [],
    })
    noCapabilities.start()
    noCapabilities.stop()

    expect(() => createGuideRuntime({
      entrypoint: "main.lua",
      sources: { "main.lua": `local b=CreateFrame("Button","b",UIParent); b:SetScript("OnClick", function() end)` },
      capabilities: ["ui"],
    }).start()).toThrow(/input capability/)
  })

  it("loads only normalized package-local modules and caches results", () => {
    const { runtime } = run(`local a=require("guide.steps"); local b=require("guide/steps.lua"); assert(a==b and a.value==42)`, { "guide/steps.lua": `return { value = 42 }` })
    runtime.stop()
    expect(() => run(`require("../secret")`)).toThrow(/package-local module name/)
    expect(() => run(`require("missing")`)).toThrow(/module 'missing' not found/)
    expect(() => createGuideRuntime({
      entrypoint: "main.lua",
      sources: { "main.lua": `require("loop")`, "loop.lua": "while true do end" },
      limits: { callbackInstructions: 2_000 },
    }).start()).toThrow(/instruction budget exceeded/)
  })

  it("emits protocol-valid map creators, aliases, camera, and destroy operations", () => {
    const { runtime, operations } = run(`
      local unit = Map:CreateUnitMarker("boss")
      unit:SetMapPosition(0.25, 0.4)
      unit:SetCreatureID(10184)
      unit:SetRole("boss")
      unit:SetFacing(1.5)
      unit:SetLabel("Onyxia")
      unit:SetColor(1, 0, 0, 0.8)
      local icon = Map:CreateIcon("safe")
      icon:SetTexture("assets/safe.png")
      icon:SetPosition(0.5, 0.5)
      Map:SetCamera(0.5, 0.5, 2)
      Guide:SetChapter("phase-one")
      assert(Guide:GetChapter() == "phase-one")
      icon:Destroy()
    `)
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "create", id: "boss", kind: "unit", parentId: null }),
      expect.objectContaining({ op: "set", id: "boss", props: { entry: 10184, unit: "10184" } }),
      { op: "camera", x: 0.5, y: 0.5, zoom: 2 },
      { op: "chapter", chapter: "phase-one" },
      { op: "destroy", id: "safe" },
    ]))
    expectValid(operations)
    runtime.stop()
  })

  it("supports protocol-valid tactical shape properties", () => {
    const { runtime, operations } = run(`
      local line=Map:CreateLine("line"); line:SetPoints({0.1,0.2,0.8,0.9}); line:SetLineWidth(3)
      local arrow=Map:CreateArrow("arrow"); arrow:SetPoints({0.2,0.2,0.7,0.7}); arrow:SetHeadSize(8)
      local circle=Map:CreateCircle("circle"); circle:SetMapPosition(0.5,0.5); circle:SetRadius(0.2); circle:SetFillColor(1,0,0,0.2)
      local cone=Map:CreateCone("cone"); cone:SetMapPosition(0.4,0.4); cone:SetRadius(0.3); cone:SetFacing(1); cone:SetAngle(0.8)
      local polygon=Map:CreatePolygon("polygon"); polygon:SetPoints({0.1,0.1,0.9,0.1,0.5,0.8}); polygon:SetFillColor(0,1,0,0.3)
      local text=Map:CreateText("map-label"); text:SetMapPosition(0.5,0.2); text:SetText("North"); text:SetFontSize(16)
    `)
    expectValid(operations)
    runtime.stop()
  })

  it("registers click, resize, and one-shot timer callbacks and flushes their operations", () => {
    const { runtime, operations, timers } = run(`
      local button = CreateFrame("Button", "next", UIParent)
      button:SetScript("OnClick", function(_, value) button:SetText(value) end)
      UIParent:SetScript("OnSizeChanged", function(_, width, height) button:SetSize(width, height) end)
      C_Timer.After(0.25, function() button:Hide() end)
    `)
    expect(operations).toContainEqual({ op: "listen", id: "next", event: "click", enabled: true })
    expect(timers).toEqual([{ id: 1, delayMs: 250 }])
    runtime.event({ id: "next", event: "click", args: ["Continue"] }); runtime.resize(800, 600); runtime.timer(1)
    const callbackOperations = runtime.flush()
    expect(callbackOperations).toEqual(expect.arrayContaining([
      { op: "set", id: "next", props: { text: "Continue" } },
      { op: "set", id: "next", props: { width: 800, height: 600 } },
      { op: "set", id: "next", props: { visible: false } },
    ]))
    expect(() => runtime.timer(1)).toThrow(/unknown timer/)
    runtime.stop()
  })

  it("aborts startup and callbacks that exceed instruction budgets", () => {
    expect(() => createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": "while true do end" }, limits: { startupInstructions: 2_000 } }).start()).toThrow(/instruction budget exceeded/)
    const { runtime } = run(`local b=CreateFrame("Button","loop",UIParent); b:SetScript("OnClick",function() while true do end end)`)
    expect(() => runtime.event({ id: "loop", event: "click" })).toThrow(/instruction budget exceeded/)
    runtime.stop()
  })

  it("preserves useful Lua filenames and lines in errors", () => {
    expect(() => run(`\nlocal value=nil\nreturn value.missing`)).toThrow(/main\.lua:3/)
    expect(() => run(`require("broken")`, { "broken.lua": "\nerror('bad module')" })).toThrow(/broken\.lua:2.*bad module/)
  })

  it("enforces timer, object, operation, and string limits", () => {
    expect(() => createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": "C_Timer.After(31,function() end)" } }).start()).toThrow(/timer delay/)
    expect(() => createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": `for i=1,3 do CreateFrame("Frame","f"..i,UIParent) end` }, limits: { maxObjects: 2 } }).start()).toThrow(/object limit/)
    expect(() => createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": `local f=CreateFrame("Frame","f",UIParent); f:SetText("12345")` }, limits: { maxStringBytes: 4 } }).start()).toThrow(/string limit/)
    expect(() => createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": `local f=CreateFrame("Frame","f",UIParent); f:Show(); f:Hide()` }, limits: { maxOperations: 2 } }).start()).toThrow(/operation limit/)
    expect(() => createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": `local a=CreateFrame("Button","a",UIParent); local b=CreateFrame("Button","b",UIParent); a:SetScript("OnClick",function() end); b:SetScript("OnClick",function() end)` }, limits: { maxCallbacks: 1 } }).start()).toThrow(/callback limit/)
  })

  it("cleans callbacks, timers, and state on stop", () => {
    const scheduled = vi.fn()
    const runtime = createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": `C_Timer.After(1,function() end)` }, scheduleTimer: scheduled })
    runtime.start(); expect(runtime.stats()).toMatchObject({ timers: 1 }); runtime.stop()
    expect(runtime.stats()).toEqual({ callbacks: 0, objects: 0, operations: 0, timers: 0, stopped: true })
    expect(() => runtime.flush()).toThrow(GuideLuaError)
  })
})
