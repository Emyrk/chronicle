import { useEffect, useRef, useState } from "react"
import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { formatNumber } from "@/lib/format"
import { GuideUiScene } from "../../../Guides/protocol/GuideUiScene"
import { applySceneBatch, createInitialScene } from "../../../Guides/protocol/scene"
import { parseWorkerMessage } from "../../../Guides/protocol/protocol"
import type { GuideCapability, RetainedScene } from "../../../Guides/protocol/types"
import type { EventStreams, PanelEvent, PanelStream, PanelStreamScope } from "../../../Guides/runtime/panelEvents"
import type { PanelReplayMetrics } from "../../../Guides/runtime/panelWorker"
import type { PanelUnits } from "../../../Guides/runtime/panelUnits"
import { explainModuleError, type ModuleErrorContext, type ModuleErrorExplanation, type ModulePhase } from "../../../Guides/runtime/moduleErrors"
import { ModuleErrorCard } from "./ModuleErrorCard"

/** Worker phases plus host-side wall time (includes copying the stream to the worker) and page drawing time. */
export type LuaPanelRunMetrics = PanelReplayMetrics & { wallMs: number; drawMs: number }

export interface LuaPanelHostProps {
  entrypoint: string
  sources: Record<string, string>
  streams: PanelStream[]
  streamScope?: PanelStreamScope
  maxEvents?: number
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
  /** Shows an "Ask the assistant to fix it" button on errors (Module Workshop only). */
  onAskAssistant?: (prompt: string) => void
}

const EMPTY_EVENTS: readonly PanelEvent[] = []
const EMPTY_IDS: readonly string[] = []
const EMPTY_ASSETS: ReadonlyMap<string, string> = new Map()

// Shared by the author preview and embedded EventsPanels. No Lua executes on the main thread.
export function LuaPanelHost({ entrypoint, sources, streams, streamScope = "selection", maxEvents, capabilities, events = EMPTY_EVENTS, eventStreams, encounterIds = EMPTY_IDS, assets = EMPTY_ASSETS, units, onMetrics, onAskAssistant }: LuaPanelHostProps) {
  const [scene, setScene] = useState<RetainedScene>(createInitialScene)
  const sceneRef = useRef(scene)
  const [error, setError] = useState<ModuleErrorExplanation | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<LuaPanelRunMetrics | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const drawMs = useRef(0)
  const onMetricsRef = useRef(onMetrics)
  useEffect(() => { onMetricsRef.current = onMetrics }, [onMetrics])
  useEffect(() => {
    const replaying = streams.length > 0 && !!eventStreams && streams.every(stream => eventStreams[stream])
    let postedAt = 0
    drawMs.current = 0
    const runtime = new Worker(new URL("../../../Guides/runtime/panelWorker.ts", import.meta.url), { type: "module" })
    workerRef.current = runtime
    let watchdog: ReturnType<typeof setTimeout> | undefined
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
        if (data && typeof data === "object" && "type" in data && data.type === "replay-complete") {
          clearTimeout(watchdog)
          if ("metrics" in data && data.metrics && typeof data.metrics === "object") {
            const run = { ...(data.metrics as PanelReplayMetrics), wallMs: performance.now() - postedAt, drawMs: drawMs.current }
            setMetrics(run); setProgress(null); onMetricsRef.current?.(run)
          }
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
          sceneRef.current = createInitialScene()
          setScene(sceneRef.current); setError(null); setMetrics(null); setProgress(replaying ? 0 : null)
          if (replaying) armWatchdog()
          else clearTimeout(watchdog)
        }
        if (message.type === "batch") {
          // Apply here, not in a state updater, so an invalid batch stops the panel instead of crashing the page.
          const drawStart = performance.now()
          sceneRef.current = applySceneBatch(sceneRef.current, message.operations)
          drawMs.current += performance.now() - drawStart
          setScene(sceneRef.current)
          if (replaying) armWatchdog()
        }
      } catch (caught) {
        stop(caught instanceof Error ? caught.message : "Invalid panel output")
      }
    }
    runtime.onerror = () => stop("Panel worker failed")
    armWatchdog()
    runtime.postMessage({ type: "start", entrypoint, sources, streams, capabilities, streamScope, maxEvents, units })
    if (replaying) { postedAt = performance.now(); runtime.postMessage({ type: "streams", streams: eventStreams, encounterIds: [...encounterIds] }) }
    return () => { clearTimeout(watchdog); runtime.terminate(); if (workerRef.current === runtime) workerRef.current = null }
  }, [entrypoint, sources, streams, streamScope, maxEvents, capabilities, eventStreams, encounterIds, units])

  useEffect(() => {
    for (const event of events) workerRef.current?.postMessage({ type: "event", event })
  }, [events])

  if (error) return <ModuleErrorCard error={error} onAskAssistant={onAskAssistant} />
  return <div className="flex min-h-0 flex-1 flex-col">
    {/* Content larger than the panel (or than UIParent:SetSize asks for) scrolls instead of being cut off. */}
    <div className="styled-scrollbar relative min-h-[240px] flex-1 overflow-auto" data-lua-panel-host>
      <div className="relative" style={{ width: scene.canvas.width ?? "100%", height: scene.canvas.height ?? "100%", minWidth: "100%", minHeight: "100%" }}>
        <GuideUiScene scene={scene} assets={assets} onNodeClick={(node) => workerRef.current?.postMessage({ type: "click", nodeId: node.id })} />
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
