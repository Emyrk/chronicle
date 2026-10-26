import { useEffect, useMemo, useRef, useState } from "react"
import { LuaPanelHost } from "../Instance/EventsPanels/LuaPanel/LuaPanelHost"
import type { PanelPackage } from "../Guides/package/panelLoader"
import { boundPreviewDamage, MAX_PREVIEW_ENCOUNTERS, MAX_PREVIEW_STREAM_BYTES } from "./luaPreviewBounds"

/** The caller must authorize instance access and enforce maxBytes during download/decompression. */
export interface LuaPreviewEventProvider {
  getDamage(instanceId: string, options: { signal: AbortSignal; maxBytes: number }): Promise<Uint8Array>
}

export interface LuaInstancePreviewProps {
  /** Entire parsed package from current unsaved editor/archive bytes, never a saved draft or release. */
  panel: PanelPackage
  instanceId: string
  encounterIds: readonly string[]
  events: LuaPreviewEventProvider
}

interface Run { id: number; instanceId: string; panel: PanelPackage; selection: string; data?: Uint8Array }
const button = "rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"

/** Explicit, ephemeral browser-only preview. No package lookup, upload or server execution. */
export function LuaInstancePreview({ panel, instanceId, encounterIds, events }: LuaInstancePreviewProps) {
  const [run, setRun] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const selection = JSON.stringify(encounterIds)
  const safeMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("safe") === "1"

  // Invalidate asynchronous data and unmount the worker on every input/provider change.
  useEffect(() => {
    const generationRef = generation
    const controllerRef = controller
    generationRef.current++
    controllerRef.current?.abort()
    controllerRef.current = null
    setRun(null)
    setBusy(false)
    setError("")
    return () => { generationRef.current++; controllerRef.current?.abort(); controllerRef.current = null }
  }, [panel, instanceId, selection, events, safeMode])

  function cancel() {
    generation.current++
    controller.current?.abort()
    controller.current = null
    setRun(null)
    setBusy(false)
    setError("")
  }

  async function start() {
    cancel()
    if (safeMode) return
    if (!instanceId || !panel.sources[panel.entrypoint] ||
      Object.values(panel.sources).some(source => source.includes("\0") || new TextEncoder().encode(source).length > 64 * 1024) ||
      panel.streams.some(stream => stream !== "damage") || panel.capabilities.some(cap => cap !== "ui" && cap !== "input")) {
      setError("Select an instance and provide a supported unsaved Lua panel package")
      return
    }
    if (!encounterIds.length || encounterIds.length > MAX_PREVIEW_ENCOUNTERS || new Set(encounterIds).size !== encounterIds.length) {
      setError(`Select 1 to ${MAX_PREVIEW_ENCOUNTERS} distinct encounters`)
      return
    }
    const abort = new AbortController()
    const id = ++generation.current
    controller.current = abort
    setBusy(true)
    try {
      let data: Uint8Array | undefined
      if (panel.streams.includes("damage")) {
        const input = await events.getDamage(instanceId, { signal: abort.signal, maxBytes: MAX_PREVIEW_STREAM_BYTES })
        if (abort.signal.aborted || generation.current !== id) return
        data = boundPreviewDamage(input, encounterIds)
      }
      if (abort.signal.aborted || generation.current !== id) return
      setRun({ id, panel, instanceId, selection, data })
    } catch (caught) {
      if (!abort.signal.aborted && generation.current === id) setError(caught instanceof Error ? caught.message : "Preview data unavailable")
    } finally {
      if (generation.current === id) { controller.current = null; setBusy(false) }
    }
  }

  const assetUrls = useMemo(() => {
    const urls = new Map<string, string>()
    if (run) for (const [path, bytes] of run.panel.assets) urls.set(path, URL.createObjectURL(new Blob([new Uint8Array(bytes)])))
    return urls
  }, [run])
  useEffect(() => () => { for (const url of assetUrls.values()) URL.revokeObjectURL(url) }, [assetUrls])

  const active = run && !safeMode && run.panel === panel && run.instanceId === instanceId && run.selection === selection
  return <section className="space-y-3" aria-label="Unsaved Lua instance preview">
    <p className="text-xs text-muted-foreground">Runs current unsaved source locally against selected encounter damage only. Up to {MAX_PREVIEW_ENCOUNTERS} encounters, 50,000 events and 8 MB of selected data. Nothing is uploaded or published.</p>
    {safeMode ? <p>Lua preview is disabled by ?safe=1.</p> : <>
      <div className="flex gap-2">
        <button className={button} type="button" disabled={busy || !instanceId || !panel.sources[panel.entrypoint]} onClick={() => void start()}>{busy ? "Loading events…" : "Run preview"}</button>
        <button className={button} type="button" disabled={!busy && !run} onClick={cancel}>Cancel preview</button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {active && <LuaPanelHost key={run.id} entrypoint={panel.entrypoint} sources={panel.sources} streams={panel.streams}
        capabilities={panel.capabilities} damageStream={run.data} encounterIds={encounterIds} assets={assetUrls} />}
    </>}
  </section>
}
