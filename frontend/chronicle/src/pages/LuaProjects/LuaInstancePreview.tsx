import { useEffect, useMemo, useRef, useState } from "react"
import { LuaPanelHost } from "../Instance/EventsPanels/LuaPanel/LuaPanelHost"
import type { PanelPackage } from "../Guides/package/panelLoader"
import type { PanelUnits } from "../Guides/runtime/panelUnits"
import { selectPreviewDamage } from "./luaPreviewBounds"

/** The caller must authorize instance access; the preview passes on every event in scope. */
export interface LuaPreviewEventProvider {
  getDamage(instanceId: string, options: { signal: AbortSignal }): Promise<Uint8Array>
}

export interface LuaInstancePreviewProps {
  /** Entire parsed package from current unsaved editor/archive bytes, never a saved draft or release. */
  panel: PanelPackage
  instanceId: string
  encounterIds: readonly string[]
  events: LuaPreviewEventProvider
  /** The previewed instance's units for Chronicle.GetUnit. */
  units?: PanelUnits
}

interface Run { id: number; instanceId: string; panel: PanelPackage; selection: string; data?: Uint8Array }
const button = "rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"

/** Explicit, ephemeral browser-only preview. No package lookup, upload or server execution. */
export function LuaInstancePreview({ panel, instanceId, encounterIds, events, units }: LuaInstancePreviewProps) {
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
    if (!encounterIds.length || new Set(encounterIds).size !== encounterIds.length) {
      setError("Select at least one encounter")
      return
    }
    const abort = new AbortController()
    const id = ++generation.current
    controller.current = abort
    setBusy(true)
    try {
      let data: Uint8Array | undefined
      if (panel.streams.includes("damage")) {
        const input = await events.getDamage(instanceId, { signal: abort.signal })
        if (abort.signal.aborted || generation.current !== id) return
        data = selectPreviewDamage(input, encounterIds, panel.streamScope)
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
    {safeMode ? <p className="text-xs">Lua preview is disabled by ?safe=1.</p> : <>
      <div className="flex items-center gap-2">
        <button className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`} type="button" disabled={busy || !instanceId || !panel.sources[panel.entrypoint]} onClick={() => void start()}>{busy ? "Loading events…" : run ? "Re-run preview" : "Run preview"}</button>
        {(busy || run) && <button className={button} type="button" onClick={cancel}>{busy ? "Cancel" : "Clear"}</button>}
        <span className="ml-auto text-[11px] text-muted-foreground" title="Damage events only. Nothing is uploaded or published.">Damage events · runs locally</span>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {active && <div className="overflow-hidden rounded-md border border-border bg-background"><LuaPanelHost key={run.id} entrypoint={panel.entrypoint} sources={panel.sources} streams={panel.streams} streamScope={panel.streamScope} maxEvents={panel.maxEvents} units={units}
        capabilities={panel.capabilities} damageStream={run.data} encounterIds={encounterIds} assets={assetUrls} /></div>}
    </>}
  </section>
}
