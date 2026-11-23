import { create, toBinary } from "@bufbuild/protobuf"
import { describe, expect, it, vi } from "vitest"
import { DamageSchema } from "@/api/proto/chronicle_pb"
import type { PanelPackage } from "../Guides/package/panelLoader"
import { createPanelWorkerHandler } from "../Guides/runtime/panelWorker"
import { parseRunPreviewArgs, runPreview, type PreviewWorker } from "./previewRun"

function varint(value: number): number[] {
  const bytes: number[] = []
  do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)) } while (value)
  return bytes
}
function encounter(id: string, amounts: number[]): number[] {
  const messages = amounts.flatMap(amount => {
    const encoded = toBinary(DamageSchema, create(DamageSchema, { caster: "0xA", target: "0xB", amount }))
    return [...varint(encoded.length), ...encoded]
  })
  return [...varint(id.length), ...new TextEncoder().encode(id), ...varint(1), ...varint(amounts.length), ...varint(messages.length), ...messages]
}

/** Runs the real worker handler in-process, delivering messages asynchronously like a Worker. */
function fakeWorker(): PreviewWorker {
  const worker: PreviewWorker = {
    onmessage: null, onerror: null, terminate() { worker.onmessage = null },
    postMessage(message) { setTimeout(() => handle(message as Parameters<typeof handle>[0]), 0) },
  }
  const handle = createPanelWorkerHandler((data) => setTimeout(() => worker.onmessage?.({ data }), 0))
  return worker
}

const panel = (lua: string, streams: PanelPackage["streams"] = ["damage"], maxEvents?: number): PanelPackage =>
  ({ name: "Test", entrypoint: "main.lua", sources: { "main.lua": lua }, streams, capabilities: ["ui"], assets: new Map(), streamScope: "selection", filterMode: "none", maxEvents }) as PanelPackage

const totals = `
  local damage = require("chronicle.v1.events.damage")
  local box = CreateFrame("Frame", "box", UIParent)
  local label = box:CreateFontString("total")
  local total = 0
  damage.onEvent(function(e) total = total + e.amount end)
  damage.onComplete(function() label:SetText("Total " .. total) end)`

describe("runPreview", () => {
  const streams = { damage: new Uint8Array([...encounter("e1", [10, 20]), ...encounter("e2", [5])]) }

  it("replays the selection and reports what the panel drew", async () => {
    const result = await runPreview({ panel: panel(totals), streams, encounterIds: ["e1"] }, undefined, fakeWorker)
    expect(result).toMatchObject({ ok: true, metrics: { events: 2, encounters: 1 }, nodes: 2, truncated: false })
    expect(result.output).toBe('frame "box" 1x1 at 0,0\n  text "total" "Total 30" at 0,0 color "#ffffffff"')
  })

  it("returns the panel's error instead of making the user copy it", async () => {
    const result = await runPreview({ panel: panel(totals, ["damage"], 1), streams, encounterIds: ["e1"] }, undefined, fakeWorker)
    expect(result).toMatchObject({ ok: false, error: "panel exceeded its max_events (1)" })
  })

  it("reports Lua errors with their location", async () => {
    const result = await runPreview({ panel: panel(`local damage = require("chronicle.v1.events.damage")\ndamage.onEvent(function(e) error("boom") end)`), streams, encounterIds: ["e1"] }, undefined, fakeWorker)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/main\.lua:2: boom/)
  })

  it("ignores spell lookups instead of failing on them", async () => {
    const lua = `${totals}
      damage.onComplete(function()
        label:SetText("Spell 133")
        Chronicle.GetSpell(133, function(spell) label:SetText(spell.name) end)
      end)`
    const result = await runPreview({ panel: panel(lua), streams, encounterIds: ["e1"] }, undefined, fakeWorker)
    expect(result).toMatchObject({ ok: true, output: expect.stringContaining('"Spell 133"') })
  })

  it("finishes after startup for panels without a stream", async () => {
    const result = await runPreview({ panel: panel(`CreateFrame("Frame", "only", UIParent)`, []), encounterIds: [] }, undefined, fakeWorker)
    expect(result).toMatchObject({ ok: true, nodes: 1, output: 'frame "only" 1x1 at 0,0' })
  })

  it.each(["", 'CreateFrame("Frame", "only", UIParent)'])("finishes synchronously at ready without a timer: %s", async (source) => {
    const messages: unknown[] = []
    const terminate = vi.fn()
    const handle = createPanelWorkerHandler(data => messages.push(data))
    const worker: PreviewWorker = {
      onmessage: null, onerror: null, terminate,
      postMessage: message => handle(message as Parameters<typeof handle>[0]),
    }
    const pending = runPreview({ panel: panel(source, []), encounterIds: [] }, undefined, () => worker)
    for (const data of messages) worker.onmessage?.({ data })
    // No timers or microtasks are advanced: ready itself completes the preview.
    expect(terminate).toHaveBeenCalledOnce()
    expect(await pending).toMatchObject({ ok: true, nodes: source ? 1 : 0 })
  })

  it("previews incremental Replay at the playhead and refuses panels that did not opt in", async () => {
    // Each framed encounter starts at epoch 1ms and these events have no offset, so a playhead at 0ms precedes them all.
    const lua = `${totals}
      Chronicle.OnReplayTime(function(ms) label:SetText(ms .. " " .. total) end)`
    const replayed = await runPreview({ panel: { ...panel(lua), replay: "incremental" }, streams, encounterIds: ["e1"], replay: { ms: 0, untilMs: 0 } }, undefined, fakeWorker)
    expect(replayed).toMatchObject({ ok: true, metrics: { events: 0 }, output: expect.stringContaining('"0 0"') })
    const refused = await runPreview({ panel: panel(lua), streams, encounterIds: ["e1"], replay: { ms: 0, untilMs: 0 } }, undefined, fakeWorker)
    expect(refused).toMatchObject({ ok: false, error: "This panel did not opt into replay mode, and is disabled." })
  })

  it("stops when the caller aborts", async () => {
    const controller = new AbortController()
    const pending = runPreview({ panel: panel(totals), streams, encounterIds: ["e1"] }, controller.signal, fakeWorker)
    controller.abort()
    await expect(pending).rejects.toBeDefined()
  })

  it("validates run_preview arguments like the server", () => {
    expect(parseRunPreviewArgs({})).toEqual({})
    expect(parseRunPreviewArgs({ encounter_ids: ["e1", "e2"] })).toEqual({ encounterIds: ["e1", "e2"] })
    expect(parseRunPreviewArgs({ encounter_ids: ["e1"], replay_ms: 61500 })).toEqual({ encounterIds: ["e1"], replayMs: 61500 })
    for (const bad of [null, [], { encounter_ids: [] }, { encounter_ids: ["e1", "e1"] }, { encounter_ids: [""] }, { instance_id: "x" }, { replay_ms: -1 }, { replay_ms: "1" }]) {
      expect(() => parseRunPreviewArgs(bad)).toThrow()
    }
  })
})
