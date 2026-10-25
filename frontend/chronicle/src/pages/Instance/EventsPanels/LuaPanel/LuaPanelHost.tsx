import { useEffect, useRef, useState } from "react"
import { GuideUiScene } from "../../../Guides/protocol/GuideUiScene"
import { applySceneBatch, createInitialScene } from "../../../Guides/protocol/scene"
import { parseWorkerMessage } from "../../../Guides/protocol/protocol"
import type { GuideCapability, RetainedScene } from "../../../Guides/protocol/types"
import type { PanelEvent, PanelStream } from "../../../Guides/runtime/panelEvents"

export interface LuaPanelHostProps {
  entrypoint: string
  sources: Record<string, string>
  streams: PanelStream[]
  capabilities: readonly GuideCapability[]
  events?: readonly PanelEvent[]
  damageStream?: Uint8Array
  encounterIds?: readonly string[]
  assets?: ReadonlyMap<string, string>
}

const EMPTY_EVENTS: readonly PanelEvent[] = []
const EMPTY_IDS: readonly string[] = []
const EMPTY_ASSETS: ReadonlyMap<string, string> = new Map()

// Shared by the author preview and embedded EventsPanels. No Lua executes on the main thread.
export function LuaPanelHost({ entrypoint, sources, streams, capabilities, events = EMPTY_EVENTS, damageStream, encounterIds = EMPTY_IDS, assets = EMPTY_ASSETS }: LuaPanelHostProps) {
  const [scene, setScene] = useState<RetainedScene>(createInitialScene)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  useEffect(() => {
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
      watchdog = setTimeout(() => stop("Panel worker exceeded its time limit"), 10_000)
    }
    runtime.onmessage = ({ data }: MessageEvent<unknown>) => {
      try {
        if (data && typeof data === "object" && "type" in data && data.type === "error") {
          stop(String("message" in data ? data.message : "Panel failed")); return
        }
        if (data && typeof data === "object" && "type" in data && data.type === "damage-complete") {
          clearTimeout(watchdog); return
        }
        const message = parseWorkerMessage(data)
        if (message.type === "ready") {
          setScene(createInitialScene()); setError(null)
          if (damageStream && streams.includes("damage")) armWatchdog()
          else clearTimeout(watchdog)
        }
        if (message.type === "batch") setScene((current) => applySceneBatch(current, message.operations))
      } catch (caught) {
        stop(caught instanceof Error ? caught.message : "Invalid panel output")
      }
    }
    runtime.onerror = () => stop("Panel worker failed")
    armWatchdog()
    runtime.postMessage({ type: "start", entrypoint, sources, streams, capabilities })
    if (damageStream && streams.includes("damage")) runtime.postMessage({ type: "damage-stream", data: damageStream, encounterIds: [...encounterIds] })
    return () => { clearTimeout(watchdog); runtime.terminate(); if (workerRef.current === runtime) workerRef.current = null }
  }, [entrypoint, sources, streams, capabilities, damageStream, encounterIds])

  useEffect(() => {
    for (const event of events) workerRef.current?.postMessage({ type: "event", event })
  }, [events])

  if (error) return <div role="alert" className="p-4 text-sm text-destructive">Lua panel stopped: {error}</div>
  return <div className="relative min-h-[240px] overflow-hidden" data-lua-panel-host>
    <GuideUiScene scene={scene} assets={assets} onNodeClick={(node) => workerRef.current?.postMessage({ type: "click", nodeId: node.id })} />
  </div>
}
