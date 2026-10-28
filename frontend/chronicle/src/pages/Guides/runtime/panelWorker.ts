/// <reference lib="webworker" />
import { createGuideRuntime } from "./runtime"
import { PANEL_STREAM_SCOPES, PANEL_STREAMS, type PanelStream, type PanelStreamScope } from "./panelEvents"
import { replayStreams } from "./panelReplay"
import type { PanelUnits } from "./panelUnits"
import type { AddonPhase } from "./addonErrors"
import { parseWorkerMessage, splitBatchOperations } from "../protocol/protocol"
import type { GuideCapability } from "../protocol/types"

/** Per-replay timings sent with replay-complete; phases add up to roughly totalMs. */
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
  /** Framed event bytes for every stream the panel declared, replayed together in log order. */
  | { type: "streams"; streams: Partial<Record<PanelStream, Uint8Array>>; encounterIds: string[] }
  | { type: "click"; nodeId: string }
  | { type: "stop" }

export function createPanelWorkerHandler(send: (value: unknown) => void) {
  let runtime: ReturnType<typeof createGuideRuntime> | null = null
  let batchId = 0
  let streamScope: PanelStreamScope = "selection"
  let maxEvents: number | undefined
  let declared: PanelStream[] = []
  let startupMs = 0
  // Reported with errors so the host can explain where the addon stopped.
  let phase: AddonPhase = "startup"
  let delivered = 0
  const flush = (operations: ReturnType<NonNullable<typeof runtime>["flush"]>) => {
    for (const chunk of splitBatchOperations(operations)) send(parseWorkerMessage({ type: "batch", batchId: String(++batchId), operations: chunk }))
  }
  return (input: Input) => {
    try {
      if (input.type === "stop" || input.type === "start") { runtime?.stop(); runtime = null; phase = "startup"; delivered = 0 }
      if (input.type === "start") {
        if (!Array.isArray(input.streams) || input.streams.some((s) => !PANEL_STREAMS.includes(s))) throw new Error("unsupported streams")
        if (!Array.isArray(input.capabilities) || input.capabilities.some((cap) => cap !== "ui" && cap !== "input")) throw new Error("unsupported capabilities")
        if (input.streamScope !== undefined && !PANEL_STREAM_SCOPES.includes(input.streamScope)) throw new Error("unsupported stream scope")
        streamScope = input.streamScope ?? "selection"
        declared = input.streams
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
        phase = "onEvent"; delivered++
        runtime.panelEvent(input.event); flush(runtime.flush())
      } else if (input.type === "streams") {
        if (!runtime) throw new Error("panel not started")
        const active = runtime
        // No host-imposed data caps: panels see every event in scope. Only the manifest's optional max_events bounds a replay.
        if (!input.streams || typeof input.streams !== "object" || !Array.isArray(input.encounterIds)) throw new Error("invalid event streams")
        const streams = Object.entries(input.streams).map(([stream, data]) => {
          if (!declared.includes(stream as PanelStream) || !(data instanceof Uint8Array)) throw new Error(`invalid event stream '${stream}'`)
          return { stream: stream as PanelStream, data }
        })
        const replayStart = performance.now()
        const selected = new Set(input.encounterIds)
        let count = 0
        let luaMs = 0
        let uiMs = 0
        let uiOperations = 0
        // Unselected encounters are skipped without decoding when the panel only wants the selection.
        const encounters = replayStreams(streams, { selected, selectedOnly: streamScope === "selection" }, (stream, event, encounter) => {
          if (maxEvents !== undefined && count >= maxEvents) throw new Error(`panel exceeded its max_events (${maxEvents})`)
          count++
          phase = "onEvent"; delivered = count
          const luaStart = performance.now()
          active.panelStreamEvent(stream, event, encounter, selected.has(encounter))
          luaMs += performance.now() - luaStart
          if (count % 100 === 0) {
            const uiStart = performance.now()
            // The runtime bounds pending UI operations per batch (maxOperations), never the whole replay.
            const batch = active.flush()
            uiOperations += batch.length
            flush(batch)
            uiMs += performance.now() - uiStart
          }
          // Lets the host tell a long replay from a stalled one.
          if (count % 1_000 === 0) send({ type: "progress", events: count })
        })
        const completeStart = performance.now()
        phase = "onComplete"
        runtime.panelComplete()
        const completeMs = performance.now() - completeStart
        const uiStart = performance.now()
        const last = runtime.flush(); uiOperations += last.length; flush(last)
        uiMs += performance.now() - uiStart
        const totalMs = performance.now() - replayStart
        const bytes = streams.reduce((total, { data }) => total + data.byteLength, 0)
        const metrics: PanelReplayMetrics = { events: count, encounters: encounters.size, bytes, startupMs, totalMs,
          decodeMs: Math.max(0, totalMs - luaMs - uiMs - completeMs), luaMs, uiMs, completeMs, uiOperations }
        send({ type: "replay-complete", metrics })
      } else if (input.type === "click") {
        if (!runtime) throw new Error("panel not started")
        phase = "click"
        runtime.event({ id: input.nodeId, event: "click" }); flush(runtime.flush())
      }
    } catch (error) {
      runtime?.stop(); runtime = null
      send({ type: "error", message: error instanceof Error ? error.message : String(error), phase, ...(phase === "onEvent" ? { events: delivered } : {}) })
    }
  }
}

const scope = typeof self === "undefined" ? null : self as DedicatedWorkerGlobalScope
if (scope) {
  const handle = createPanelWorkerHandler((message) => scope.postMessage(message))
  scope.onmessage = (event: MessageEvent<Input>) => handle(event.data)
}
