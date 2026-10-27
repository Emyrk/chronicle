import { create, toBinary } from "@bufbuild/protobuf"
import { describe, expect, it } from "vitest"
import { DamageSchema } from "@/api/proto/chronicle_pb"
import { createPanelWorkerHandler } from "./panelWorker"

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
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.flatMap(b => b.operations)).toHaveLength(1000)
    for (const batch of batches) expect(new TextEncoder().encode(JSON.stringify(batch)).byteLength).toBeLessThanOrEqual(64 * 1024)
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
    handle({ type: "damage-stream", data: new Uint8Array(data), encounterIds: ["e2"] })
    return messages
  }
  const finalText = (messages: unknown[]) => messages.flatMap(message => (message as { operations?: Array<{ op: string; props?: { text?: string } }> }).operations ?? [])
    .filter(op => op.op === "set").map(op => op.props?.text)

  it("sends only selected encounters by default and calls onComplete before damage-complete", () => {
    const messages = replay()
    expect(finalText(messages)).toEqual(["e2=7*"])
    expect(messages.at(-1)).toMatchObject({ type: "damage-complete" })
  })

  it("sends every encounter tagged with selected for stream_scope instance", () => {
    expect(finalText(replay("instance"))).toEqual(["e1=5 e2=7*"])
  })

  it("reports replay metrics with damage-complete", () => {
    expect(replay().at(-1)).toMatchObject({ type: "damage-complete", metrics: { events: 1, encounters: 1, uiOperations: 1 } })
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
      damage.onEvent(function() n = n + 1; label:SetText(n) end)
      damage.onComplete(function() label:SetText("done " .. n) end)
    `
    const messages = replay("selection", { lua: counter, data: encounter("e2", new Array(60_000).fill(1)) })
    expect(messages).toContainEqual({ type: "progress", events: 60_000 })
    expect(finalText(messages).at(-1)).toBe("done 60000")
    expect(messages.at(-1)).toMatchObject({ type: "damage-complete" })
  })

  it("stops only at the manifest's own max_events", () => {
    expect(replay("instance", { maxEvents: 1 })).toContainEqual(expect.objectContaining({ type: "error", message: "panel exceeded its max_events (1)" }))
    expect(replay("instance", { maxEvents: 2 }).at(-1)).toMatchObject({ type: "damage-complete" })
  })
})
