/// <reference lib="webworker" />
import { createGuideRuntime } from "./runtime"
import { PANEL_STREAM_SCOPES, PANEL_STREAMS, type PanelStream, type PanelStreamScope } from "./panelEvents"
import { FastDamageCursor } from "@/api/protodecode/decode"
import { parseWorkerMessage } from "../protocol/protocol"
import type { GuideCapability } from "../protocol/types"

const MAX_BATCH_OPERATIONS = 10_000

// Dedicated worker entry. The caller owns termination and treats all returned scene batches as untrusted.
type Input =
  | { type: "start"; entrypoint: string; sources: Record<string, string>; streams: PanelStream[]; capabilities: GuideCapability[]; streamScope?: PanelStreamScope; maxEvents?: number }
  | { type: "event"; event: unknown }
  | { type: "damage-stream"; data: Uint8Array; encounterIds: string[] }
  | { type: "click"; nodeId: string }
  | { type: "stop" }

export function createPanelWorkerHandler(send: (value: unknown) => void) {
  let runtime: ReturnType<typeof createGuideRuntime> | null = null
  let batchId = 0
  let streamScope: PanelStreamScope = "selection"
  let maxEvents: number | undefined
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
        runtime = createGuideRuntime({ entrypoint: input.entrypoint, sources: input.sources,
          capabilities: input.capabilities, panelStreams: input.streams })
        const initial = runtime.start(); send({ type: "ready", protocolVersion: 1 }); flush(initial)
      } else if (input.type === "event") {
        if (!runtime) throw new Error("panel not started")
        runtime.panelEvent(input.event); flush(runtime.flush())
      } else if (input.type === "damage-stream") {
        if (!runtime) throw new Error("panel not started")
        // No host-imposed data caps: panels see every event in scope. Only the manifest's optional max_events bounds a replay.
        if (!(input.data instanceof Uint8Array) || !Array.isArray(input.encounterIds)) throw new Error("invalid damage stream")
        const selected = new Set(input.encounterIds)
        const cursor = new FastDamageCursor(input.data)
        let count = 0
        while (cursor.currentHeader) {
          if (!cursor.hasMoreInEncounter) { cursor.nextEncounter(); continue }
          const encounter = cursor.currentHeader.encounterID
          const event = cursor.next()
          const isSelected = selected.has(encounter)
          if (!event || (!isSelected && streamScope === "selection")) continue
          if (maxEvents !== undefined && count >= maxEvents) throw new Error(`panel exceeded its max_events (${maxEvents})`)
          count++
          runtime.panelEvent({ stream: "damage", source: event.caster ?? "", target: event.target ?? "",
            amount: event.amount, offsetMs: event.offsetMilli, encounterId: encounter, selected: isSelected })
          if (count % 100 === 0) {
            // Bound each UI batch, not the whole replay, so long replays are never cut off for size alone.
            const batch = runtime.flush()
            if (batch.length > MAX_BATCH_OPERATIONS) throw new Error(`panel output limit exceeded (over ${MAX_BATCH_OPERATIONS} UI operations per 100 events)`)
            flush(batch)
          }
          // Lets the host tell a long replay from a stalled one.
          if (count % 1_000 === 0) send({ type: "progress", events: count })
        }
        runtime.panelComplete()
        flush(runtime.flush())
        send({ type: "damage-complete" })
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
