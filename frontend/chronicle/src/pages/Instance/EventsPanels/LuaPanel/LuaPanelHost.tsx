import { useEffect, useRef, useState } from "react"
import { GuideUiScene } from "../../../Guides/protocol/GuideUiScene"
import { applySceneBatch, createInitialScene } from "../../../Guides/protocol/scene"
import { parseWorkerMessage } from "../../../Guides/protocol/protocol"
import type { GuideCapability, RetainedScene } from "../../../Guides/protocol/types"
import type { PanelEvent, PanelStream, PanelStreamScope } from "../../../Guides/runtime/panelEvents"
import type { PanelReplayMetrics } from "../../../Guides/runtime/panelWorker"

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
  damageStream?: Uint8Array
  encounterIds?: readonly string[]
  assets?: ReadonlyMap<string, string>
  /** Called once per completed damage replay. */
  onMetrics?: (metrics: LuaPanelRunMetrics) => void
}

const EMPTY_EVENTS: readonly PanelEvent[] = []
const EMPTY_IDS: readonly string[] = []
const EMPTY_ASSETS: ReadonlyMap<string, string> = new Map()

// Shared by the author preview and embedded EventsPanels. No Lua executes on the main thread.
export function LuaPanelHost({ entrypoint, sources, streams, streamScope = "selection", maxEvents, capabilities, events = EMPTY_EVENTS, damageStream, encounterIds = EMPTY_IDS, assets = EMPTY_ASSETS, onMetrics }: LuaPanelHostProps) {
  const [scene, setScene] = useState<RetainedScene>(createInitialScene)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<LuaPanelRunMetrics | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const drawMs = useRef(0)
  const onMetricsRef = useRef(onMetrics)
  useEffect(() => { onMetricsRef.current = onMetrics }, [onMetrics])
  useEffect(() => {
    const replaying = !!damageStream && streams.includes("damage")
    let postedAt = 0
    drawMs.current = 0
    const runtime = new Worker(new URL("../../../Guides/runtime/panelWorker.ts", import.meta.url), { type: "module" })
    workerRef.current = runtime
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const stop = (reason: string) => {
      clearTimeout(watchdog)
      runtime.terminate()
      setError(reason)
    }
    const armWatchdog = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => stop("Panel worker made no progress for 10 seconds"), 10_000)
    }
    runtime.onmessage = ({ data }: MessageEvent<unknown>) => {
      try {
        if (data && typeof data === "object" && "type" in data && data.type === "error") {
          stop(String("message" in data ? data.message : "Panel failed")); return
        }
        if (data && typeof data === "object" && "type" in data && data.type === "damage-complete") {
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
          setScene(createInitialScene()); setError(null); setMetrics(null); setProgress(replaying ? 0 : null)
          if (replaying) armWatchdog()
          else clearTimeout(watchdog)
        }
        if (message.type === "batch") {
          setScene((current) => {
            const drawStart = performance.now()
            const next = applySceneBatch(current, message.operations)
            drawMs.current += performance.now() - drawStart
            return next
          })
          if (replaying) armWatchdog()
        }
      } catch (caught) {
        stop(caught instanceof Error ? caught.message : "Invalid panel output")
      }
    }
    runtime.onerror = () => stop("Panel worker failed")
    armWatchdog()
    runtime.postMessage({ type: "start", entrypoint, sources, streams, capabilities, streamScope, maxEvents })
    if (replaying) { postedAt = performance.now(); runtime.postMessage({ type: "damage-stream", data: damageStream, encounterIds: [...encounterIds] }) }
    return () => { clearTimeout(watchdog); runtime.terminate(); if (workerRef.current === runtime) workerRef.current = null }
  }, [entrypoint, sources, streams, streamScope, maxEvents, capabilities, damageStream, encounterIds])

  useEffect(() => {
    for (const event of events) workerRef.current?.postMessage({ type: "event", event })
  }, [events])

  if (error) return <div role="alert" className="p-4 text-sm text-destructive">Lua panel stopped: {error}</div>
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="relative min-h-[240px] flex-1 overflow-hidden" data-lua-panel-host>
      <GuideUiScene scene={scene} assets={assets} onNodeClick={(node) => workerRef.current?.postMessage({ type: "click", nodeId: node.id })} />
    </div>
    {(metrics || progress !== null) && <LuaRunMetricsBar metrics={metrics} progress={progress} />}
  </div>
}

const ms = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(0)} ms`

function LuaRunMetricsBar({ metrics, progress }: { metrics: LuaPanelRunMetrics | null; progress: number | null }) {
  if (!metrics) return <div role="status" className="border-t border-border px-3 py-1 font-mono text-[11px] text-muted-foreground">
    Replaying… {(progress ?? 0).toLocaleString()} events</div>
  const transfer = Math.max(0, metrics.wallMs - metrics.totalMs)
  const parts: Array<[string, number, string]> = [
    ["Lua", metrics.luaMs, "Lua onEvent callbacks"],
    ["decode", metrics.decodeMs, "Decoding the damage stream and skipping unselected encounters"],
    ["UI", metrics.uiMs, "Collecting and posting UI updates from the worker"],
    ["complete", metrics.completeMs, "Lua onComplete callback"],
    ["draw", metrics.drawMs, "Applying UI updates on the page"],
    ["startup", metrics.startupMs, "Loading the Lua state and running main.lua"],
    ["transfer", transfer, "Copying the stream to the worker and message delivery"],
  ]
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border px-3 py-1 font-mono text-[11px] text-muted-foreground"
    title={`${metrics.bytes.toLocaleString()} stream bytes, ${metrics.uiOperations.toLocaleString()} UI operations`}>
    <span className="text-blue-500">{metrics.events.toLocaleString()} events · {metrics.encounters} enc · {ms(metrics.wallMs)}</span>
    {parts.map(([label, value, title]) => <span key={label} title={title}>{label} {ms(value)}</span>)}
  </div>
}
