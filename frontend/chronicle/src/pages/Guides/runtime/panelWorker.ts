/// <reference lib="webworker" />
import { createGuideRuntime, type PanelTimeRange } from "./runtime"
import { PANEL_STREAM_SCOPES, PANEL_STREAMS, validatePanelEvent, type PanelStream, type PanelStreamScope } from "./panelEvents"
import { replayStreams } from "./panelReplay"
import { PANEL_FILTER_MODES, type PanelFilterMode } from "./panelFilters"
import { UnitState } from "../../Instance/EventsPanels/processors/unitState"
import { compileFilters } from "../../Instance/EventsPanels/processors/filters"
import type { ProcessorContext, ProcessorEvent, UnitClassificationProcessorEvent } from "../../Instance/EventsPanels/processorTypes"
import type { PanelUnits } from "./panelUnits"
import type { ModulePhase } from "./moduleErrors"
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
  | { type: "start"; entrypoint: string; sources: Record<string, string>; streams: PanelStream[]; capabilities: GuideCapability[]; streamScope?: PanelStreamScope; maxEvents?: number; units?: PanelUnits; filterMode?: PanelFilterMode; filterContext?: ProcessorContext }
  | { type: "event"; event: unknown }
  /** Framed event bytes for every stream the panel declared, replayed together in log order. */
  | { type: "streams"; streams: Partial<Record<PanelStream, Uint8Array>>; encounterIds: string[] }
  | { type: "click"; nodeId: string }
  /** The page's current time range filter; null when none is set. */
  | { type: "time-range"; range: PanelTimeRange | null }
  | { type: "stop" }

export function createPanelWorkerHandler(send: (value: unknown) => void) {
  let runtime: ReturnType<typeof createGuideRuntime> | null = null
  let batchId = 0
  let streamScope: PanelStreamScope = "selection"
  let maxEvents: number | undefined
  let declared: PanelStream[] = []
  let filterMode: PanelFilterMode = "none"
  let predicate: (event: ProcessorEvent) => boolean = () => true
  let filterMessage: (message: Record<string, unknown>, eventIndex?: number) => boolean = () => true
  let unitState: UnitState | undefined
  const encounterStarts = new Map<string, number>()
  const classifications: Array<{ startMs: number; event: UnitClassificationProcessorEvent }> = []
  let currentTime = 0
  let currentIndex = -1
  const encounterOffsets = new Map<string, number>()
  let startupMs = 0
  // Reported with errors so the host can explain where the addon stopped.
  let phase: ModulePhase = "startup"
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
        if (input.filterMode !== undefined && !PANEL_FILTER_MODES.includes(input.filterMode)) throw new Error("unsupported filter mode")
        filterMode = input.filterMode ?? "none"
        encounterOffsets.clear()
        encounterStarts.clear()
        classifications.length = 0
        currentTime = 0
        currentIndex = -1
        const context = input.filterContext ?? { players: {}, selectedEncounterIds: new Set<string>(), entitySelection: { playerIds: new Set<string>(), enemyIds: new Set<string>() } }
        unitState = new UnitState(context.units ?? {}, context.vehicleControlIntervals ?? [])
        context.unitState = unitState
        predicate = filterMode === "none" ? () => true : compileFilters(context.filters ?? [], context)
        filterMessage = (message: Record<string, unknown>, eventIndex?: number) => {
          const offsetMilli = message.offsetMs as number
          const event = { ...message, type: message.stream, offsetMilli,
            globalOffsetMilli: (encounterOffsets.get(message.encounterId as string) ?? 0) + offsetMilli,
            ...(message.stream !== "ressurection" && { caster: message.source }),
          } as unknown as ProcessorEvent
          const timestamp = (encounterStarts.get(message.encounterId as string) ?? 0) + offsetMilli
          if (filterMode === "none" || !context.filters?.length || (timestamp === currentTime && (eventIndex === undefined || eventIndex === currentIndex))) return predicate(event)
          // A retained event must see its own ownership time, not the replay's final state.
          // Keep the live state intact so checking older events cannot affect current ones.
          const historical = new UnitState(context.units ?? {}, context.vehicleControlIntervals ?? [])
          historical.setCurrentTimestamp(timestamp)
          for (const entry of classifications) {
            const time = entry.startMs + entry.event.offsetMilli
            if (time > timestamp) continue
            if (time === timestamp && entry.startMs === encounterStarts.get(message.encounterId as string) && eventIndex !== undefined && entry.event.index > eventIndex) continue
            historical.processClassification(entry.event)
          }
          // Compilers capture unitState when created, so use an isolated historical context.
          return compileFilters(context.filters ?? [], { ...context, unitState: historical })(event)
        }
        streamScope = input.streamScope ?? "selection"
        declared = input.streams
        if (input.maxEvents !== undefined && (!Number.isSafeInteger(input.maxEvents) || input.maxEvents < 1)) throw new Error("invalid max_events")
        maxEvents = input.maxEvents
        const started = performance.now()
        if (input.units !== undefined && (!input.units || typeof input.units !== "object" || Array.isArray(input.units))) throw new Error("invalid units")
        runtime = createGuideRuntime({ entrypoint: input.entrypoint, sources: input.sources,
          capabilities: input.capabilities, panelStreams: input.streams, units: input.units, filter: filterMessage })
        const initial = runtime.start(); startupMs = performance.now() - started
        // Ready is the startup barrier: every initial drawing batch has been sent.
        flush(initial); send({ type: "ready", protocolVersion: 1 })
      } else if (input.type === "event") {
        if (!runtime) throw new Error("panel not started")
        const event = validatePanelEvent(input.event, declared)
        if (filterMode === "prefilter" && !filterMessage(event)) return
        phase = "onEvent"; delivered++
        runtime.panelEvent(input.event); flush(runtime.flush())
      } else if (input.type === "streams") {
        if (!runtime) throw new Error("panel not started")
        const active = runtime
        // No host-imposed data caps: panels see every event in scope. Only the manifest's optional max_events bounds a replay.
        if (!input.streams || typeof input.streams !== "object" || !Array.isArray(input.encounterIds)) throw new Error("invalid event streams")
        const streams = Object.entries(input.streams).map(([stream, data]) => {
          if ((!declared.includes(stream as PanelStream) && !(filterMode !== "none" && stream === "unit_classification")) || !(data instanceof Uint8Array)) throw new Error(`invalid event stream '${stream}'`)
          return { stream: stream as PanelStream, data }
        })
        const replayStart = performance.now()
        const selected = new Set(input.encounterIds)
        let baseTimestamp: number | null = null
        let visited = 0
        let count = 0
        let luaMs = 0
        let uiMs = 0
        let uiOperations = 0
        const progress = () => { if (visited % 1_000 === 0) send({ type: "progress", events: count }) }
        // Unselected encounters are skipped except ownership updates needed by filters.
        const encounters = replayStreams(streams, { selected, selectedOnly: streamScope === "selection", unselectedStreams: filterMode !== "none" ? new Set(["unit_classification"]) : undefined }, (stream, event, encounter, startMs) => {
          visited++
          if (baseTimestamp === null && selected.has(encounter)) baseTimestamp = startMs
          const baseOffset = baseTimestamp !== null ? startMs - baseTimestamp : 0
          encounterOffsets.set(encounter, baseOffset)
          encounterStarts.set(encounter, startMs)
          currentTime = startMs + event.offsetMilli
          currentIndex = event.index
          const filterEvent = event as ProcessorEvent
          filterEvent.globalOffsetMilli = baseOffset + event.offsetMilli
          unitState?.setCurrentTimestamp(startMs + event.offsetMilli)
          if (stream === "unit_classification") {
            const classification = event as unknown as UnitClassificationProcessorEvent
            unitState?.processClassification(classification)
            classifications.push({ startMs, event: { ...classification } })
          }
          if (!declared.includes(stream) || (streamScope === "selection" && !selected.has(encounter))) { progress(); return }
          if (filterMode === "prefilter" && !predicate(filterEvent)) { progress(); return }
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
          // Progress also advances through events excluded before Lua delivery.
          progress()
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
        // Chronicle.SetTimeRange / ClearTimeRange during the click; the host decides whether to apply it.
        const request = runtime.takeTimeRangeRequest()
        if (request) send({ type: "set-time-range", range: request.range })
      } else if (input.type === "time-range") {
        if (!runtime) return
        phase = "timeRange"
        runtime.setTimeRange(input.range); flush(runtime.flush())
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
