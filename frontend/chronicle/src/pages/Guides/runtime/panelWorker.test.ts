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
  const replay = (streamScope?: "selection" | "instance") => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": source }, streams: ["damage"], capabilities: ["ui"], streamScope })
    handle({ type: "damage-stream", data: new Uint8Array([...encounter("e1", [5]), ...encounter("e2", [7])]), encounterIds: ["e2"] })
    return messages
  }
  const finalText = (messages: unknown[]) => messages.flatMap(message => (message as { operations?: Array<{ op: string; props?: { text?: string } }> }).operations ?? [])
    .filter(op => op.op === "set").map(op => op.props?.text)

  it("sends only selected encounters by default and calls onComplete before damage-complete", () => {
    const messages = replay()
    expect(finalText(messages)).toEqual(["e2=7.0*"])
    expect(messages.at(-1)).toEqual({ type: "damage-complete" })
  })

  it("sends every encounter tagged with selected for stream_scope instance", () => {
    expect(finalText(replay("instance"))).toEqual(["e1=5.0 e2=7.0*"])
  })

  it("rejects unknown stream scopes", () => {
    expect(replay("everything" as "instance")).toContainEqual(expect.objectContaining({ type: "error", message: "unsupported stream scope" }))
  })
})
