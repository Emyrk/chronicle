import { useEffect, useRef, useState } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { spellQueryOptions } from "@/api/queries"
import { useDatasetId } from "@/hooks/useDatasetId"
import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { formatNumber } from "@/lib/format"
import { GuideUiScene } from "../../../Guides/protocol/GuideUiScene"
import { PanelTimeRangeContext, type PanelTimeRangeValue } from "../../../Guides/protocol/panelTimeRange"
import { applySceneBatch, createInitialScene } from "../../../Guides/protocol/scene"
import { parseWorkerMessage } from "../../../Guides/protocol/protocol"
import type { GuideCapability, RetainedScene } from "../../../Guides/protocol/types"
import { DEFAULT_REPLAY_DEBOUNCE_MS, type EventStreams, type PanelEvent, type PanelStream, type PanelStreamScope } from "../../../Guides/runtime/panelEvents"
import type { PanelReplayMetrics } from "../../../Guides/runtime/panelWorker"
import type { PanelUnits } from "../../../Guides/runtime/panelUnits"
import type { PanelSpellInfo, PanelTimeRange } from "../../../Guides/runtime/runtime"
import { explainModuleError, type ModuleErrorContext, type ModuleErrorExplanation, type ModulePhase } from "../../../Guides/runtime/moduleErrors"
import type { PanelFilterMode } from "../../../Guides/runtime/panelFilters"
import type { ProcessorContext } from "../processorTypes"
import { ModuleErrorCard } from "./ModuleErrorCard"

/** Worker phases plus host-side wall time (includes copying the stream to the worker) and page drawing time. */
export type LuaPanelRunMetrics = PanelReplayMetrics & { wallMs: number; drawMs: number }

export interface LuaPanelHostProps {
  entrypoint: string
  sources: Record<string, string>
  streams: PanelStream[]
  streamScope?: PanelStreamScope
  maxEvents?: number
  filterMode?: PanelFilterMode
  filterContext?: ProcessorContext
  capabilities: readonly GuideCapability[]
  events?: readonly PanelEvent[]
  /** Bytes for every declared stream; the replay starts once all of them are here. */
  eventStreams?: EventStreams
  encounterIds?: readonly string[]
  assets?: ReadonlyMap<string, string>
  /** Units Lua can look up with Chronicle.GetUnit; memoize it, since a new object restarts the panel. */
  units?: PanelUnits
  /** Called once per completed replay. */
  onMetrics?: (metrics: LuaPanelRunMetrics) => void
  /** The page's time range filter, readable from Lua with Chronicle.GetTimeRange. */
  timeRange?: PanelTimeRange | null
  /** Applies Chronicle.SetTimeRange / ClearTimeRange from a click; omit where there is no page time range. */
  onSetTimeRange?: (range: PanelTimeRange | null) => void
  /**
   * The Replay playhead while Replay is on: `ms` from encounter start for Lua, `untilMs` as the log's epoch ms.
   * Null when Replay is off.
   */
  replay?: PanelReplayTime | null
  /** The manifest's `replay: "incremental"`: deliver events only up to the playhead while Replay is on. */
  incremental?: boolean
  /** The manifest's `replay_debounce_ms`: how long the playhead must rest after moving back before an incremental replay restarts. */
  replayDebounceMs?: number
  /** Applies Chronicle.SetReplayTime from a click; omit where there is no Replay playhead. */
  onSetReplayTime?: (ms: number) => void
}

export type PanelReplayTime = { ms: number; untilMs: number }

const bound = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)

/** Worker output is untrusted: accept only {startMs, endMs} with ms bounds, or null. */
function parseTimeRange(value: unknown): PanelTimeRange | null | undefined {
  if (value === null) return null
  if (!value || typeof value !== "object") return undefined
  const { startMs, endMs } = value as Record<string, unknown>
  if (Object.keys(value).length !== 2 || !bound(startMs) || !bound(endMs)) return undefined
  if (startMs !== null && endMs !== null && endMs < startMs) return undefined
  return { startMs, endMs }
}

/** Largest spell-request the host serves; the runtime caps lookups per run anyway. */
const MAX_SPELL_REQUEST = 1_000

/** Chronicle.GetSpell's answer for one spell, or null when Chronicle has no data for it. */
async function fetchSpellInfo(queryClient: QueryClient, datasetId: string | undefined, id: number): Promise<PanelSpellInfo | null> {
  try {
    const spell = await queryClient.fetchQuery(spellQueryOptions(String(id), datasetId))
    const name = spell.name?.["0"]
    if (!name) return null
    return { id, name, rank: spell.subtext?.["0"] || undefined, icon: spell.spell_icon?.TextureFilename?.toLowerCase() || undefined }
  } catch { return null }
}

const EMPTY_EVENTS: readonly PanelEvent[] = []
const EMPTY_IDS: readonly string[] = []
const EMPTY_ASSETS: ReadonlyMap<string, string> = new Map()

// Shared by the author preview and embedded EventsPanels. No Lua executes on the main thread.
export function LuaPanelHost({ entrypoint, sources, streams, streamScope = "selection", maxEvents, filterMode = "none", filterContext, capabilities, events = EMPTY_EVENTS, eventStreams, encounterIds = EMPTY_IDS, assets = EMPTY_ASSETS, units, onMetrics, timeRange = null, onSetTimeRange, replay = null, incremental = false, replayDebounceMs = DEFAULT_REPLAY_DEBOUNCE_MS, onSetReplayTime }: LuaPanelHostProps) {
  const [scene, setScene] = useState<RetainedScene>(createInitialScene)
  const sceneRef = useRef(scene)
  const [error, setError] = useState<ModuleErrorExplanation | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<LuaPanelRunMetrics | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const drawMs = useRef(0)
  const onMetricsRef = useRef(onMetrics)
  const timeRangeRef = useRef(timeRange)
  const onSetTimeRangeRef = useRef(onSetTimeRange)
  const onSetReplayTimeRef = useRef(onSetReplayTime)
  const replayRef = useRef(replay)
  const incrementalReplay = incremental && replay !== null
  // Lua state cannot rewind, so an incremental replay restarts the module when the playhead moves back.
  const [restarts, setRestarts] = useState(0)
  // The playhead an incremental replay has been delivered up to; null when not replaying incrementally.
  const sentUntilRef = useRef<number | null>(null)
  // True while the worker owes a replay-paused or replay-complete; only then does the watchdog run.
  const awaitingRef = useRef(false)
  // Chronicle.GetSpell answers come from the same cached spell query as spell icons and tooltips.
  const queryClient = useQueryClient()
  const datasetId = useDatasetId()
  const spellSourceRef = useRef({ queryClient, datasetId })
  useEffect(() => { onMetricsRef.current = onMetrics; onSetTimeRangeRef.current = onSetTimeRange; onSetReplayTimeRef.current = onSetReplayTime; spellSourceRef.current = { queryClient, datasetId } }, [onMetrics, onSetTimeRange, onSetReplayTime, queryClient, datasetId])
  // Declared before the worker effect so a worker started in the same commit sees the current playhead.
  const replayMs = replay?.ms ?? null
  const replayUntilMs = replay?.untilMs ?? null
  useEffect(() => {
    replayRef.current = replayMs === null || replayUntilMs === null ? null : { ms: replayMs, untilMs: replayUntilMs }
  }, [replayMs, replayUntilMs])
  useEffect(() => {
    const replaying = streams.length > 0 && !!eventStreams && streams.every(stream => eventStreams[stream])
    let postedAt = 0
    drawMs.current = 0
    const runtime = new Worker(new URL("../../../Guides/runtime/panelWorker.ts", import.meta.url), { type: "module" })
    workerRef.current = runtime
    // Reset before startup batches arrive; ready must preserve the scene they built.
    sceneRef.current = createInitialScene()
    setScene(sceneRef.current); setError(null); setMetrics(null); setProgress(replaying ? 0 : null)
    let watchdog: ReturnType<typeof setTimeout> | undefined
    // Only the replay is watched. Batches from later clicks must not re-arm it, or an idle panel stops 10s after a click.
    awaitingRef.current = replaying
    const stop = (reason: string, context?: ModuleErrorContext) => {
      clearTimeout(watchdog)
      runtime.terminate()
      setError(explainModuleError(reason, context))
    }
    const armWatchdog = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => stop("Panel worker made no progress for 10 seconds"), 10_000)
    }
    runtime.onmessage = ({ data }: MessageEvent<unknown>) => {
      try {
        if (data && typeof data === "object" && "type" in data && data.type === "error") {
          const context = data as { phase?: ModulePhase; events?: number }
          stop(String("message" in data ? data.message : "Panel failed"), { phase: context.phase, events: context.events }); return
        }
        if (data && typeof data === "object" && "type" in data && (data.type === "replay-complete" || data.type === "replay-paused")) {
          awaitingRef.current = false
          clearTimeout(watchdog)
          if ("metrics" in data && data.metrics && typeof data.metrics === "object") {
            const run = { ...(data.metrics as PanelReplayMetrics), wallMs: performance.now() - postedAt, drawMs: drawMs.current }
            setMetrics(run); setProgress(null); onMetricsRef.current?.(run)
          }
          return
        }
        if (data && typeof data === "object" && "type" in data && data.type === "spell-request") {
          const ids = "ids" in data ? data.ids : undefined
          if (!Array.isArray(ids) || ids.length > MAX_SPELL_REQUEST || !ids.every(id => Number.isInteger(id) && id > 0)) throw new Error("Invalid spell request from panel")
          const source = spellSourceRef.current
          void Promise.all(ids.map(async (id: number) => ({ id, spell: await fetchSpellInfo(source.queryClient, source.datasetId, id) })))
            .then(spells => { if (workerRef.current === runtime) runtime.postMessage({ type: "spell-info", spells }) })
          return
        }
        if (data && typeof data === "object" && "type" in data && data.type === "set-time-range") {
          const range = parseTimeRange("range" in data ? data.range : undefined)
          if (range === undefined) throw new Error("Invalid time range from panel")
          onSetTimeRangeRef.current?.(range)
          return
        }
        if (data && typeof data === "object" && "type" in data && data.type === "set-replay-time") {
          const ms = "ms" in data ? data.ms : undefined
          if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) throw new Error("Invalid replay time from panel")
          onSetReplayTimeRef.current?.(ms)
          return
        }
        // The watchdog measures inactivity, not total time: large replays keep it alive with progress.
        if (data && typeof data === "object" && "type" in data && data.type === "progress") {
          armWatchdog()
          if ("events" in data && typeof data.events === "number") setProgress(data.events)
          return
        }
        const message = parseWorkerMessage(data)
        if (message.type === "ready") {
          if (awaitingRef.current) armWatchdog()
          else clearTimeout(watchdog)
        }
        if (message.type === "batch") {
          // Apply here, not in a state updater, so an invalid batch stops the panel instead of crashing the page.
          const drawStart = performance.now()
          sceneRef.current = applySceneBatch(sceneRef.current, message.operations)
          drawMs.current += performance.now() - drawStart
          setScene(sceneRef.current)
          if (awaitingRef.current) armWatchdog()
        }
      } catch (caught) {
        stop(caught instanceof Error ? caught.message : "Invalid panel output")
      }
    }
    runtime.onerror = () => stop("Panel worker failed")
    armWatchdog()
    runtime.postMessage({ type: "start", entrypoint, sources, streams, capabilities, streamScope, maxEvents, units, filterMode, filterContext })
    runtime.postMessage({ type: "time-range", range: timeRangeRef.current })
    const untilMs = incrementalReplay ? replayRef.current?.untilMs : undefined
    sentUntilRef.current = untilMs ?? null
    // The worker applies replayMs after the events, so OnReplayTime can draw what they built.
    const replayMs = replayRef.current?.ms ?? null
    if (replaying) { postedAt = performance.now(); runtime.postMessage({ type: "streams", streams: eventStreams, encounterIds: [...encounterIds], untilMs, replayMs }) }
    else runtime.postMessage({ type: "replay-time", ms: replayMs })
    return () => { clearTimeout(watchdog); runtime.terminate(); if (workerRef.current === runtime) workerRef.current = null }
  }, [entrypoint, sources, streams, streamScope, maxEvents, filterMode, filterContext, capabilities, eventStreams, encounterIds, units, incrementalReplay, restarts])

  // Keep Lua's Chronicle.GetReplayTime in step with the playhead. An incremental replay first resumes up to it,
  // or restarts when the playhead moved back past what it already delivered.
  useEffect(() => {
    const sentUntil = sentUntilRef.current
    if (incrementalReplay && replayUntilMs !== null && sentUntil !== null) {
      if (replayUntilMs < sentUntil) {
        // Scrubbing back would restart on every step, so wait until the playhead rests. Moving forward
        // past what was delivered before the timer fires resumes instead (this effect's cleanup cancels it).
        if (replayDebounceMs <= 0) { setRestarts(count => count + 1); return }
        const timer = setTimeout(() => setRestarts(count => count + 1), replayDebounceMs)
        return () => clearTimeout(timer)
      }
      if (replayUntilMs > sentUntil) {
        sentUntilRef.current = replayUntilMs
        awaitingRef.current = true
        workerRef.current?.postMessage({ type: "replay-time", ms: replayMs, untilMs: replayUntilMs })
        return
      }
    }
    workerRef.current?.postMessage({ type: "replay-time", ms: replayMs })
  }, [replayMs, replayUntilMs, incrementalReplay, replayDebounceMs])

  // Keep Lua's Chronicle.GetTimeRange in step with the page; a new worker gets it right after start.
  const startMs = timeRange?.startMs ?? null
  const endMs = timeRange?.endMs ?? null
  useEffect(() => {
    const range = startMs === null && endMs === null ? null : { startMs, endMs }
    timeRangeRef.current = range
    workerRef.current?.postMessage({ type: "time-range", range })
  }, [startMs, endMs])

  useEffect(() => {
    for (const event of events) workerRef.current?.postMessage({ type: "event", event })
  }, [events])

  // Lets widgets such as a selectable LineChart read and set the page time range.
  const timeRangeContext: PanelTimeRangeValue = { range: startMs === null && endMs === null ? null : { startMs, endMs }, select: onSetTimeRange }

  if (error) return <ModuleErrorCard error={error} />
  return <div className="flex min-h-0 flex-1 flex-col">
    {/* Content larger than the panel (or than UIParent:SetSize asks for) scrolls instead of being cut off. */}
    <div className="styled-scrollbar relative min-h-[240px] flex-1 overflow-auto" data-lua-panel-host>
      <div className="relative" style={{ width: scene.canvas.width ?? "100%", height: scene.canvas.height ?? "100%", minWidth: "100%", minHeight: "100%" }}>
        <PanelTimeRangeContext.Provider value={timeRangeContext}>
          <GuideUiScene
            scene={scene}
            assets={assets}
            onNodeClick={(node) => workerRef.current?.postMessage({ type: "click", nodeId: node.id })}
            onBreakoutClose={(node) => workerRef.current?.postMessage({ type: "close", nodeId: node.id })}
          />
        </PanelTimeRangeContext.Provider>
      </div>
    </div>
    {(metrics || progress !== null) && <LuaRunMetricsBar metrics={metrics} progress={progress} />}
  </div>
}

const ms = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)}ms`

/** Matches the built-in panel performance footer; the ? icon shows the full timing breakdown. */
function LuaRunMetricsBar({ metrics, progress }: { metrics: LuaPanelRunMetrics | null; progress: number | null }) {
  const footer = "flex shrink-0 items-center justify-between px-2 pb-1 font-mono text-2xs text-muted-foreground"
  if (!metrics) return <div role="status" className={footer} data-panel-performance-footer>
    <span>{formatNumber(progress ?? 0)} events<span className="ml-2 text-blue-500">updating…</span></span>
  </div>
  const eventsPerSecond = metrics.totalMs > 0 ? metrics.events / (metrics.totalMs / 1000) : 0
  const transfer = Math.max(0, metrics.wallMs - metrics.totalMs)
  const rows: Array<[string, number, string]> = [
    ["Lua onEvent", metrics.luaMs, "Your event callbacks"],
    ["Decode", metrics.decodeMs, "Reading the damage stream"],
    ["UI updates", metrics.uiMs, "Collecting and posting UI changes"],
    ["Lua onComplete", metrics.completeMs, "Your completion callback"],
  ]
  const outside: Array<[string, number, string]> = [
    ["Startup", metrics.startupMs, "Loading main.lua"],
    ["Transfer", transfer, "Copying the stream to the worker"],
    ["Draw", metrics.drawMs, "Applying UI changes on the page"],
  ]
  const row = ([label, value, hint]: [string, number, string]) => <div key={label} className="contents">
    <span title={hint}>{label}</span>
    <span className="text-right">{ms(value)}</span>
    <span className="text-right text-muted-foreground">{metrics.totalMs > 0 ? `${Math.round(value / metrics.totalMs * 100)}%` : ""}</span>
  </div>
  return <div className={footer} data-panel-performance-footer>
    <span>{formatNumber(metrics.events)} events{eventsPerSecond > 0 && <span className="ml-2">({formatNumber(eventsPerSecond)}/s)</span>}</span>
    <span className="flex items-center gap-1">
      <span className="text-blue-500">{metrics.totalMs.toFixed(0)}ms</span>
      <TooltipProvider delayDuration={100}><Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Panel timing details" className="-m-1 p-1 text-muted-foreground/70 hover:text-foreground"><HelpCircle className="size-3" /></button>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" sideOffset={6} className="w-64 p-3 font-mono text-[11px]">
          <div className="mb-2 font-sans text-xs font-semibold">Module timing</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5">
            {rows.map(row)}
            <span className="border-t border-border pt-1 font-semibold">Worker total</span>
            <span className="border-t border-border pt-1 text-right font-semibold">{ms(metrics.totalMs)}</span>
            <span className="border-t border-border pt-1" />
            {outside.map(([label, value, hint]) => <div key={label} className="contents">
              <span title={hint}>{label}</span><span className="text-right">{ms(value)}</span><span />
            </div>)}
            <span className="border-t border-border pt-1 font-semibold">End to end</span>
            <span className="border-t border-border pt-1 text-right font-semibold">{ms(metrics.wallMs + metrics.drawMs)}</span>
            <span className="border-t border-border pt-1" />
          </div>
          <div className="mt-2 font-sans text-muted-foreground">
            {formatNumber(metrics.events)} events from {metrics.encounters} encounter{metrics.encounters === 1 ? "" : "s"} ·{" "}
            {formatBytes(metrics.bytes)} stream · {formatNumber(metrics.uiOperations)} UI operations ·{" "}
            {metrics.events > 0 ? `${(metrics.luaMs * 1000 / metrics.events).toFixed(1)}µs Lua per event` : "no events"}
          </div>
        </TooltipContent>
      </Tooltip></TooltipProvider>
    </span>
  </div>
}

function formatBytes(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}
