/// <reference lib="webworker" />
import { createGuideRuntime } from "./runtime"
import { PANEL_STREAMS, type PanelStream } from "./panelEvents"
import { FastDamageCursor } from "@/api/protodecode/decode"
import { parseWorkerMessage } from "../protocol/protocol"
import type { GuideCapability } from "../protocol/types"

// Dedicated worker entry. The caller owns termination and treats all returned scene batches as untrusted.
type Input =
  | { type: "start"; entrypoint: string; sources: Record<string, string>; streams: PanelStream[]; capabilities: GuideCapability[] }
  | { type: "event"; event: unknown }
  | { type: "damage-stream"; data: Uint8Array; encounterIds: string[] }
  | { type: "click"; nodeId: string }
  | { type: "stop" }

export function createPanelWorkerHandler(send: (value: unknown) => void) {
  let runtime: ReturnType<typeof createGuideRuntime> | null = null
  let batchId = 0
  const flush = (operations: ReturnType<NonNullable<typeof runtime>["flush"]>) => {
    if (operations.length) send(parseWorkerMessage({ type: "batch", batchId: String(++batchId), operations }))
  }
  return (input: Input) => {
    try {
      if (input.type === "stop" || input.type === "start") { runtime?.stop(); runtime = null }
      if (input.type === "start") {
        if (!Array.isArray(input.streams) || input.streams.some((s) => !PANEL_STREAMS.includes(s))) throw new Error("unsupported streams")
        if (!Array.isArray(input.capabilities) || input.capabilities.some((cap) => cap !== "ui" && cap !== "input")) throw new Error("unsupported capabilities")
        runtime = createGuideRuntime({ entrypoint: input.entrypoint, sources: input.sources,
          capabilities: input.capabilities, panelStreams: input.streams })
        const initial = runtime.start(); send({ type: "ready", protocolVersion: 1 }); flush(initial)
      } else if (input.type === "event") {
        if (!runtime) throw new Error("panel not started")
        runtime.panelEvent(input.event); flush(runtime.flush())
      } else if (input.type === "damage-stream") {
        if (!runtime) throw new Error("panel not started")
        if (!(input.data instanceof Uint8Array) || input.data.byteLength > 32_000_000 ||
          !Array.isArray(input.encounterIds) || input.encounterIds.length > 1_000) throw new Error("invalid damage stream")
        const selected = new Set(input.encounterIds)
        const cursor = new FastDamageCursor(input.data)
        let count = 0
        let scanned = 0
        let totalOperations = 0
        while (cursor.currentHeader) {
          if (!cursor.hasMoreInEncounter) { cursor.nextEncounter(); continue }
          if (++scanned > 500_000) throw new Error("panel scan limit exceeded")
          const encounter = cursor.currentHeader.encounterID
          const event = cursor.next()
          if (!event || !selected.has(encounter)) continue
          if (++count > 50_000) throw new Error("panel event limit exceeded")
          runtime.panelEvent({ stream: "damage", source: event.caster ?? "", target: event.target ?? "",
            amount: event.amount, offsetMs: event.offsetMilli })
          if (count % 100 === 0) {
            const batch = runtime.flush(); totalOperations += batch.length
            if (totalOperations > 10_000) throw new Error("panel output limit exceeded")
            flush(batch)
          }
        }
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
