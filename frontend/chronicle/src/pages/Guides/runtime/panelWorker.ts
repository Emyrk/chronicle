/// <reference lib="webworker" />
import { createGuideRuntime } from "./runtime"
import { PANEL_STREAM_SCOPES, PANEL_STREAMS, type PanelStream, type PanelStreamScope } from "./panelEvents"
import { FastDamageCursor } from "@/api/protodecode/decode"
import type { PanelUnits } from "./panelUnits"
import { parseWorkerMessage } from "../protocol/protocol"
import type { GuideCapability } from "../protocol/types"

const MAX_BATCH_OPERATIONS = 10_000

/** Per-replay timings sent with damage-complete; phases add up to roughly totalMs. */
export type PanelReplayMetrics = {
  events: number
  encounters: number
  bytes: number
  /** Creating the Lua state and running the entrypoint. */
  startupMs: number
  /** Whole replay inside the worker, from receiving the stream to onComplete returning. */
  totalMs: number
  /** Decoding and skipping events (total minus the other phases). */
  decodeMs: number
  /** Lua onEvent callbacks. */
  luaMs: number
  /** Collecting and posting UI batches. */
  uiMs: number
  /** Lua onComplete callback. */
  completeMs: number
  uiOperations: number
}

// Dedicated worker entry. The caller owns termination and treats all returned scene batches as untrusted.
type Input =
  | { type: "start"; entrypoint: string; sources: Record<string, string>; streams: PanelStream[]; capabilities: GuideCapability[]; streamScope?: PanelStreamScope; maxEvents?: number; units?: PanelUnits }
  | { type: "event"; event: unknown }
  | { type: "damage-stream"; data: Uint8Array; encounterIds: string[] }
  | { type: "click"; nodeId: string }
  | { type: "stop" }

export function createPanelWorkerHandler(send: (value: unknown) => void) {
  let runtime: ReturnType<typeof createGuideRuntime> | null = null
  let batchId = 0
  let streamScope: PanelStreamScope = "selection"
  let maxEvents: number | undefined
  let startupMs = 0
  const flush = (operations: ReturnType<NonNullable<typeof runtime>["flush"]>) => {
    if (operations.length) send(parseWorkerMessage({ type: "batch", batchId: String(++batchId), operations }))
  }
  return (input: Input) => {
    try {
      if (input.type === "stop" || input.type === "start") { runtime?.stop(); runtime = null }
      if (input.type === "start") {
        if (!Array.isArray(input.streams) || input.streams.some((s) => !PANEL_STREAMS.includes(s))) throw new Error("unsupported streams")
        if (!Array.isArray(input.capabilities) || input.capabilities.some((cap) => cap !== "ui" && cap !== "input")) throw new Error("unsupported capabilities")
        if (input.streamScope !== undefined && !PANEL_STREAM_SCOPES.includes(input.streamScope)) throw new Error("unsupported stream scope")
        streamScope = input.streamScope ?? "selection"
        if (input.maxEvents !== undefined && (!Number.isSafeInteger(input.maxEvents) || input.maxEvents < 1)) throw new Error("invalid max_events")
        maxEvents = input.maxEvents
        const started = performance.now()
        if (input.units !== undefined && (!input.units || typeof input.units !== "object" || Array.isArray(input.units))) throw new Error("invalid units")
        runtime = createGuideRuntime({ entrypoint: input.entrypoint, sources: input.sources,
          capabilities: input.capabilities, panelStreams: input.streams, units: input.units })
        const initial = runtime.start(); startupMs = performance.now() - started
        send({ type: "ready", protocolVersion: 1 }); flush(initial)
      } else if (input.type === "event") {
        if (!runtime) throw new Error("panel not started")
        runtime.panelEvent(input.event); flush(runtime.flush())
      } else if (input.type === "damage-stream") {
        if (!runtime) throw new Error("panel not started")
        // No host-imposed data caps: panels see every event in scope. Only the manifest's optional max_events bounds a replay.
        if (!(input.data instanceof Uint8Array) || !Array.isArray(input.encounterIds)) throw new Error("invalid damage stream")
        const replayStart = performance.now()
        const selected = new Set(input.encounterIds)
        const cursor = new FastDamageCursor(input.data)
        let count = 0
        let luaMs = 0
        let uiMs = 0
        let uiOperations = 0
        const encounters = new Set<string>()
        while (cursor.currentHeader) {
          if (!cursor.hasMoreInEncounter) { cursor.nextEncounter(); continue }
          const encounter = cursor.currentHeader.encounterID
          const isSelected = selected.has(encounter)
          // Unselected encounters are skipped without decoding when the panel only wants the selection.
          if (!isSelected && streamScope === "selection") { cursor.skipEncounter(); continue }
          const event = cursor.next()
          if (!event) continue
          encounters.add(encounter)
          if (maxEvents !== undefined && count >= maxEvents) throw new Error(`panel exceeded its max_events (${maxEvents})`)
          count++
          const luaStart = performance.now()
          runtime.panelEvent({ stream: "damage", source: event.caster ?? "", target: event.target ?? "",
            amount: event.amount, offsetMs: event.offsetMilli, encounterId: encounter, selected: isSelected })
          luaMs += performance.now() - luaStart
          if (count % 100 === 0) {
            const uiStart = performance.now()
            // Bound each UI batch, not the whole replay, so long replays are never cut off for size alone.
            const batch = runtime.flush()
            if (batch.length > MAX_BATCH_OPERATIONS) throw new Error(`panel output limit exceeded (over ${MAX_BATCH_OPERATIONS} UI operations per 100 events)`)
            uiOperations += batch.length
            flush(batch)
            uiMs += performance.now() - uiStart
          }
          // Lets the host tell a long replay from a stalled one.
          if (count % 1_000 === 0) send({ type: "progress", events: count })
        }
        const completeStart = performance.now()
        runtime.panelComplete()
        const completeMs = performance.now() - completeStart
        const uiStart = performance.now()
        const last = runtime.flush(); uiOperations += last.length; flush(last)
        uiMs += performance.now() - uiStart
        const totalMs = performance.now() - replayStart
        const metrics: PanelReplayMetrics = { events: count, encounters: encounters.size, bytes: input.data.byteLength, startupMs, totalMs,
          decodeMs: Math.max(0, totalMs - luaMs - uiMs - completeMs), luaMs, uiMs, completeMs, uiOperations }
        send({ type: "damage-complete", metrics })
      } else if (input.type === "click") {
        if (!runtime) throw new Error("panel not started")
        runtime.event({ id: input.nodeId, event: "click" }); flush(runtime.flush())
      }
    } catch (error) {
      runtime?.stop(); runtime = null
      send({ type: "error", message: error instanceof Error ? error.message : String(error) })
    }
  }
}

const scope = typeof self === "undefined" ? null : self as DedicatedWorkerGlobalScope
if (scope) {
  const handle = createPanelWorkerHandler((message) => scope.postMessage(message))
  scope.onmessage = (event: MessageEvent<Input>) => handle(event.data)
}
