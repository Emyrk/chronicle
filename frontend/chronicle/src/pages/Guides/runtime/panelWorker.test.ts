import { create, toBinary } from "@bufbuild/protobuf"
import { describe, expect, it } from "vitest"
import { AuraSchema, DamageSchema, HealSchema } from "@/api/proto/chronicle_pb"
import { createPanelWorkerHandler } from "./panelWorker"
import { applySceneBatch, createInitialScene } from "../protocol/scene"

function varint(value: number): number[] {
  const bytes: number[] = []
  do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)) } while (value)
  return bytes
}
/** One framed encounter of damage events, as served by the events endpoint. */
function encounter(id: string, amounts: number[]): number[] {
  const messages = amounts.flatMap(amount => {
    const encoded = toBinary(DamageSchema, create(DamageSchema, { caster: "0xA", target: "0xB", amount }))
    return [...varint(encoded.length), ...encoded]
  })
  return [...varint(id.length), ...new TextEncoder().encode(id), ...varint(1), ...varint(amounts.length), ...varint(messages.length), ...messages]
}

/** One framed encounter of already-encoded messages. */
function frame(id: string, encoded: Uint8Array[]): number[] {
  const messages = encoded.flatMap(message => [...varint(message.length), ...message])
  return [...varint(id.length), ...new TextEncoder().encode(id), ...varint(1), ...varint(encoded.length), ...varint(messages.length), ...messages]
}
const meta = (index: number) => ({ index, offsetMilli: BigInt(index * 100) })

describe("Lua panel worker capability boundary", () => {
  const start = (source: string, capabilities: Array<"ui" | "input">) => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": source }, streams: [], capabilities })
    return messages
  }

  it("does not grant UI when the manifest declares no capabilities", () => {
    expect(start(`CreateFrame("Frame", "f", UIParent)`, []))
      .toContainEqual(expect.objectContaining({ type: "error", message: expect.stringMatching(/nil value/) }))
  })

  it("does not grant input to a UI-only manifest", () => {
    expect(start(`local b=CreateFrame("Button","b",UIParent); b:SetScript("OnClick", function() end)`, ["ui"]))
      .toContainEqual(expect.objectContaining({ type: "error", message: expect.stringMatching(/input capability/) }))
  })

  it("splits a large redraw into several batches under the message limit", () => {
    // 500 labels with ~1 KiB of text each is ~500 KiB of UI operations in one startup.
    const messages = start(`for i = 1, 500 do UIParent:CreateFontString("t" .. i):SetText(string.rep("x", 1000)) end`, ["ui"])
    const batches = messages.filter((m): m is { type: "batch"; operations: unknown[] } => (m as { type: string }).type === "batch")
    expect(messages).not.toContainEqual(expect.objectContaining({ type: "error" }))
    expect(messages.at(-1)).toEqual({ type: "ready", protocolVersion: 1 })
    expect(messages.slice(0, -1)).toEqual(batches)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.flatMap(b => b.operations)).toHaveLength(1000)
    for (const batch of batches) expect(new TextEncoder().encode(JSON.stringify(batch)).byteLength).toBeLessThanOrEqual(64 * 1024)
  })

  it("lets UIParent set the panel's content size, which the scene keeps", () => {
    const messages = start(`UIParent:SetHeight(900); UIParent:SetSize(500, 1200); UIParent:SetWidth(640)`, ["ui"])
    const operations = messages.flatMap(m => (m as { type: string; operations?: unknown[] }).type === "batch" ? (m as { operations: unknown[] }).operations : [])
    expect(operations).toEqual([
      { op: "canvas", width: null, height: 900 }, { op: "canvas", width: 500, height: 1200 }, { op: "canvas", width: 640, height: 1200 },
    ])
    expect(applySceneBatch(createInitialScene(), operations).canvas).toEqual({ width: 640, height: 1200 })
    expect(start(`UIParent:SetHeight(0)`, ["ui"])).toContainEqual(expect.objectContaining({ type: "error", message: expect.stringMatching(/between 1 and 16384/) }))
    expect(start(`UIParent:SetText("x")`, ["ui"])).toContainEqual(expect.objectContaining({ type: "error", message: expect.stringMatching(/UIParent only supports SetSize/) }))
  })

  it("signals ready even when startup draws nothing", () => {
    expect(start("", ["ui"])).toEqual([{ type: "ready", protocolVersion: 1 }])
  })

  it("allows UI without input callbacks", () => {
    expect(start(`CreateFrame("Frame", "f", UIParent)`, ["ui"]))
      .toContainEqual(expect.objectContaining({ type: "ready" }))
  })
})

describe("Lua panel worker damage replay", () => {
  const source = `
    local label = CreateFrame("FontString", "out", UIParent)
    local damage = require("chronicle.v1.events.damage")
    local parts = {}
    damage.onEvent(function(e) parts[#parts + 1] = e.encounterId .. "=" .. e.amount .. (e.selected and "*" or "") end)
    damage.onComplete(function() label:SetText(table.concat(parts, " ")) end)
  `
  const replay = (streamScope?: "selection" | "instance", { lua = source, data = [...encounter("e1", [5]), ...encounter("e2", [7])], maxEvents }: { lua?: string; data?: number[]; maxEvents?: number } = {}) => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": lua }, streams: ["damage"], capabilities: ["ui"], streamScope, maxEvents })
    handle({ type: "streams", streams: { damage: new Uint8Array(data) }, encounterIds: ["e2"] })
    return messages
  }
  const finalText = (messages: unknown[]) => messages.flatMap(message => (message as { operations?: Array<{ op: string; props?: { text?: string } }> }).operations ?? [])
    .filter(op => op.op === "set").map(op => op.props?.text)

  it("sends only selected encounters by default and calls onComplete before replay-complete", () => {
    const messages = replay()
    expect(finalText(messages)).toEqual(["e2=7*"])
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete" })
  })

  it("sends every encounter tagged with selected for stream_scope instance", () => {
    expect(finalText(replay("instance"))).toEqual(["e1=5 e2=7*"])
  })

  it("reports replay metrics with replay-complete", () => {
    expect(replay().at(-1)).toMatchObject({ type: "replay-complete", metrics: { events: 1, encounters: 1, uiOperations: 1 } })
    const metrics = (replay("instance").at(-1) as { metrics: Record<string, number> }).metrics
    expect(metrics).toMatchObject({ events: 2, encounters: 2 })
    for (const key of ["startupMs", "totalMs", "decodeMs", "luaMs", "uiMs", "completeMs"]) expect(metrics[key]).toBeGreaterThanOrEqual(0)
  })

  it("rejects unknown stream scopes", () => {
    expect(replay("everything" as "instance")).toContainEqual(expect.objectContaining({ type: "error", message: "unsupported stream scope" }))
  })

  it("replays more events than the old fixed caps and reports progress", () => {
    const counter = `
      local label = CreateFrame("FontString", "out", UIParent)
      local damage = require("chronicle.v1.events.damage")
      local n = 0
      damage.onEvent(function() n = n + 1 end)
      damage.onComplete(function() label:SetText("done " .. n) end)
    `
    const messages = replay("selection", { lua: counter, data: encounter("e2", new Array(60_000).fill(1)) })
    expect(messages).toContainEqual({ type: "progress", events: 60_000 })
    expect(finalText(messages).at(-1)).toBe("done 60000")
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete" })
  })

  it("ends the replay at events.stop and still runs onComplete", () => {
    const stopper = `
      local label = CreateFrame("FontString", "out", UIParent)
      local events = require("chronicle.v1.events")
      local seen, first = 0, nil
      events.onEvent(function(e)
        first = first or e.encounterId
        if e.encounterId ~= first then events.stop(); return end
        seen = seen + 1
      end)
      events.onComplete(function() label:SetText("seen " .. seen) end)
    `
    const messages = replay("instance", { lua: stopper, data: [...encounter("e1", [1, 2, 3]), ...encounter("e2", new Array(5_000).fill(1))] })
    expect(finalText(messages)).toEqual(["seen 3"])
    // Only e2's first event was delivered before the replay ended.
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete", metrics: { events: 4, encounters: 2 } })
    expect(messages).not.toContainEqual(expect.objectContaining({ type: "error" }))
  })

  it("skips every event when Panel:StopEvents runs during startup", () => {
    const early = `
      local label = CreateFrame("FontString", "out", UIParent)
      local n = 0
      Panel:OnEvent(function() n = n + 1 end)
      Panel:OnComplete(function() label:SetText("events " .. n) end)
      Panel:StopEvents()
    `
    const messages = replay("instance", { lua: early })
    expect(finalText(messages)).toEqual(["events 0"])
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete", metrics: { events: 0 } })
  })

  it("stops only at the manifest's own max_events", () => {
    expect(replay("instance", { maxEvents: 1 })).toContainEqual(expect.objectContaining({ type: "error", message: "panel exceeded its max_events (1)" }))
    expect(replay("instance", { maxEvents: 2 }).at(-1)).toMatchObject({ type: "replay-complete" })
  })
})

describe("Lua panel worker multi-stream replay", () => {
  const damage = frame("e1", [0, 3].map(index => toBinary(DamageSchema, create(DamageSchema, { meta: meta(index), caster: "0xA", target: "0xB", amount: 10 + index }))))
  const heal = frame("e1", [toBinary(HealSchema, create(HealSchema, { meta: meta(1), caster: "0xC", target: "0xA", amount: 50, spellData: { id: 2050, name: "Lesser Heal" } }))])
  const aura = frame("e1", [toBinary(AuraSchema, create(AuraSchema, { meta: meta(2), target: "0xA", spellName: "Power Word: Fortitude", isBuff: true }))])
  const run = (lua: string, streams: Array<"damage" | "heal" | "aura"> = ["damage", "heal", "aura"]) => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": lua }, streams, capabilities: ["ui"] })
    const bytes = { damage: new Uint8Array(damage), heal: new Uint8Array(heal), aura: new Uint8Array(aura) }
    handle({ type: "streams", streams: Object.fromEntries(streams.map(stream => [stream, bytes[stream]])), encounterIds: ["e1"] })
    return messages
  }
  const text = (messages: unknown[]) => messages.flatMap(message => (message as { operations?: Array<{ op: string; props?: { text?: string } }> }).operations ?? [])
    .filter(op => op.op === "set").map(op => op.props?.text).at(-1)
  const draw = (body: string) => `
    local label = CreateFrame("FontString", "out", UIParent)
    local parts = {}
    ${body}
    Panel:OnComplete(function() label:SetText(table.concat(parts, " ")) end)
  `

  it("interleaves every declared stream in log order for a catch-all callback", () => {
    const messages = run(draw(`Panel:OnEvent(function(e) parts[#parts + 1] = e.stream .. "@" .. e.offsetMs end)`))
    expect(text(messages)).toBe("damage@0 heal@100 aura@200 damage@300")
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete", metrics: { events: 4 } })
  })

  it("passes each stream's own fields, with caster as source", () => {
    expect(text(run(draw(`
      Panel:OnEvent("heal", function(e) parts[#parts + 1] = e.source .. ">" .. e.target .. ":" .. e.amount .. ":" .. e.spellId end)
      require("chronicle.v1.events.aura").onEvent(function(e) parts[#parts + 1] = e.spellName .. ":" .. tostring(e.isBuff) end)
    `)))).toBe("0xC>0xA:50:2050 Power Word: Fortitude:true")
  })

  it("calls the stream callback and the catch-all for the same event", () => {
    expect(text(run(draw(`
      Panel:OnEvent("heal", function(e) parts[#parts + 1] = "heal" end)
      Panel:OnEvent(function(e) parts[#parts + 1] = "any:" .. e.stream end)
    `), ["heal"]))).toBe("heal any:heal")
  })

  it("rejects streams the manifest did not declare", () => {
    expect(run(draw(`Panel:OnEvent("aura", function() end)`), ["damage"])).toContainEqual(expect.objectContaining({ type: "error", message: expect.stringContaining("'aura' is not allowed") }))
  })
})

describe("Lua panel worker time range", () => {
  it("forwards a click's time range request and gives Lua the page's range", () => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", capabilities: ["ui", "input"], streams: [], sources: { "main.lua": `
      local label = CreateFrame("FontString", "label", UIParent)
      local button = CreateFrame("Button", "b", UIParent)
      button:SetScript("OnClick", function()
        local startMs = Chronicle.GetTimeRange()
        label:SetText(tostring(startMs))
        Chronicle.SetTimeRange(1000, 2000)
      end)
      local idle = CreateFrame("Button", "idle", UIParent)
      idle:SetScript("OnClick", function() end)
    ` } })
    handle({ type: "time-range", range: { startMs: 500, endMs: null } })
    messages.length = 0
    handle({ type: "click", nodeId: "b" })
    expect(messages).toContainEqual(expect.objectContaining({ type: "batch", operations: [{ op: "set", id: "label", props: { text: "500" } }] }))
    expect(messages).toContainEqual({ type: "set-time-range", range: { startMs: 1000, endMs: 2000 } })
    messages.length = 0
    handle({ type: "click", nodeId: "idle" })
    expect(messages).not.toContainEqual(expect.objectContaining({ type: "set-time-range" }))
  })

  it("runs OnTimeRangeChanged when the host sends a new range and draws its output", () => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", capabilities: ["ui"], streams: [], sources: { "main.lua": `
      local label = CreateFrame("FontString", "label", UIParent)
      Chronicle.OnTimeRangeChanged(function(startMs, endMs) label:SetText(startMs .. "-" .. endMs) end)
    ` } })
    messages.length = 0
    handle({ type: "time-range", range: { startMs: 1000, endMs: 4000 } })
    expect(messages).toContainEqual(expect.objectContaining({ type: "batch", operations: [{ op: "set", id: "label", props: { text: "1000-4000" } }] }))
    messages.length = 0
    handle({ type: "time-range", range: { startMs: 1000, endMs: 4000 } })
    expect(messages).toEqual([])
  })

  it("requests spells after a flush and runs GetSpell callbacks when the host answers", () => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", capabilities: ["ui"], streams: [], sources: { "main.lua": `
      local label = CreateFrame("FontString", "label", UIParent)
      Chronicle.GetSpell(116, function(spell) label:SetText(spell and spell.name or "unknown") end)
      Chronicle.GetSpell(5, function(spell) label:SetText(spell and spell.name or "unknown") end)
    ` } })
    expect(messages).toContainEqual({ type: "spell-request", ids: [116, 5] })
    messages.length = 0
    // Host answers are untrusted shapes: bad names become nil, bad icons are dropped.
    handle({ type: "spell-info", spells: [{ id: 116, spell: { id: 116, name: "Frostbolt", icon: "../x" } }, { id: 5, spell: { id: 5, name: "" } }] })
    expect(messages).toContainEqual(expect.objectContaining({ type: "batch", operations: [
      { op: "set", id: "label", props: { text: "Frostbolt" } },
      { op: "set", id: "label", props: { text: "unknown" } },
    ] }))
  })

  it("closes Breakout frames and reports OnClose errors with their phase", () => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", capabilities: ["ui", "input"], streams: [], sources: { "main.lua": `
      local details = CreateFrame("Breakout", "details")
      details:Show()
      details:SetScript("OnClose", function() error("boom") end)
    ` } })
    messages.length = 0
    handle({ type: "close", nodeId: "details" })
    expect(messages).toContainEqual(expect.objectContaining({ type: "error", phase: "close", message: expect.stringMatching(/boom/) }))
  })

  it("reports errors in OnTimeRangeChanged with their phase", () => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", capabilities: ["ui"], streams: [], sources: { "main.lua": `Chronicle.OnTimeRangeChanged(function() error("boom") end)` } })
    handle({ type: "time-range", range: { startMs: 1, endMs: 2 } })
    expect(messages).toContainEqual(expect.objectContaining({ type: "error", phase: "timeRange", message: expect.stringMatching(/boom/) }))
  })
})

describe("Lua panel worker Replay mode", () => {
  // Encounter e1 starts at epoch 1ms: damage at 1ms and 301ms, heal at 101ms.
  const damage = frame("e1", [0, 3].map(index => toBinary(DamageSchema, create(DamageSchema, { meta: meta(index), caster: "0xA", target: "0xB", amount: 10 + index }))))
  const heal = frame("e1", [toBinary(HealSchema, create(HealSchema, { meta: meta(1), caster: "0xC", target: "0xA", amount: 50, spellData: { id: 2050, name: "Lesser Heal" } }))])
  const lua = `
    local label = CreateFrame("FontString", "out", UIParent)
    local count, done = 0, false
    Panel:OnEvent(function() count = count + 1 end)
    Panel:OnComplete(function() done = true end)
    Chronicle.OnReplayTime(function(ms) label:SetText(tostring(ms) .. ":" .. count .. (done and ":done" or "")) end)
    local button = CreateFrame("Button", "seek", UIParent)
    button:SetScript("OnClick", function() Chronicle.SetReplayTime(1234.4) end)
  `
  const begin = (capabilities: Array<"ui" | "input"> = ["ui", "input"]) => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": lua }, streams: ["damage", "heal"], capabilities })
    return { messages, handle, streams: { damage: new Uint8Array(damage), heal: new Uint8Array(heal) } }
  }
  const text = (messages: unknown[]) => messages.flatMap(message => (message as { operations?: Array<{ op: string; props?: { text?: string } }> }).operations ?? [])
    .filter(op => op.op === "set").map(op => op.props?.text).at(-1)

  it("completes a paused incremental replay as soon as Lua stops events", () => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", streams: ["damage", "heal"], capabilities: ["ui"], sources: { "main.lua": `
      local label = CreateFrame("FontString", "out", UIParent)
      local count = 0
      Panel:OnEvent(function() count = count + 1; if count == 2 then Panel:StopEvents() end end)
      Panel:OnComplete(function() label:SetText("done " .. count) end)
    ` } })
    // The playhead at 1000ms would pause after all three events; the stop ends the replay after the second.
    handle({ type: "streams", streams: { damage: new Uint8Array(damage), heal: new Uint8Array(heal) }, encounterIds: ["e1"], untilMs: 1_000, replayMs: 999 })
    expect(text(messages)).toBe("done 2")
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete", metrics: { events: 2 } })
  })

  it("delivers incremental events up to the playhead, resumes forward, and completes at the end", () => {
    const { messages, handle, streams } = begin()
    handle({ type: "streams", streams, encounterIds: ["e1"], untilMs: 150, replayMs: 149 })
    expect(text(messages)).toBe("149:2")
    expect(messages.at(-1)).toMatchObject({ type: "replay-paused", metrics: { events: 2 } })
    messages.length = 0
    handle({ type: "replay-time", ms: 299, untilMs: 300 })
    expect(text(messages)).toBe("299:2")
    expect(messages.at(-1)).toMatchObject({ type: "replay-paused" })
    messages.length = 0
    handle({ type: "replay-time", ms: 400, untilMs: 401 })
    expect(text(messages)).toBe("400:3:done")
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete", metrics: { events: 3 } })
  })

  it("gives full replays the playhead after onComplete and nil when Replay turns off", () => {
    const { messages, handle, streams } = begin()
    handle({ type: "streams", streams, encounterIds: ["e1"], replayMs: 50 })
    expect(text(messages)).toBe("50:3:done")
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete" })
    messages.length = 0
    handle({ type: "replay-time", ms: null })
    expect(text(messages)).toBe("nil:3:done")
    messages.length = 0
    handle({ type: "replay-time", ms: null })
    expect(messages).toEqual([])
  })

  it("forwards SetReplayTime from a click and needs the input capability", () => {
    const { messages, handle } = begin()
    handle({ type: "click", nodeId: "seek" })
    expect(messages).toContainEqual({ type: "set-replay-time", ms: 1234 })
  })

  it("rejects invalid playheads", () => {
    const { messages, handle } = begin()
    handle({ type: "replay-time", ms: -1 })
    expect(messages.at(-1)).toMatchObject({ type: "error", message: "invalid replay time" })
  })
})
