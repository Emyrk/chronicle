import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { Switch } from "@/components/ui/Switch/Switch"
import { LuaPanelHost } from "../Instance/EventsPanels/LuaPanel/LuaPanelHost"
import type { PanelPackage } from "../Guides/package/panelLoader"
import type { PanelUnits } from "../Guides/runtime/panelUnits"
import { PANEL_STREAMS, type EventStreams } from "../Guides/runtime/panelEvents"
import { loadPreviewStreams, type PreviewStreamProvider } from "./previewStream"

/** The caller must authorize instance access; the preview passes on every event in scope. */
export type LuaPreviewEventProvider = Pick<PreviewStreamProvider, "getStream">

export interface LuaInstancePreviewProps {
  /** Entire parsed package from current unsaved editor/archive bytes, never a saved draft or release. */
  panel: PanelPackage
  instanceId: string
  encounterIds: readonly string[]
  events: LuaPreviewEventProvider
  /** The previewed instance's units for Chronicle.GetUnit. */
  units?: PanelUnits
  /** Sends a prompt to the workshop assistant, for the error card's "Ask the assistant" button. */
  onAskAssistant?: (prompt: string) => void
}

interface Run { id: number; instanceId: string; panel: PanelPackage; selection: string; encounterIds: readonly string[]; streams: EventStreams }
const button = "whitespace-nowrap rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"

const autoPreviewKey = "lua-workshop-auto-preview"
/** Wait for a pause in typing before an automatic re-run. */
const AUTO_PREVIEW_DELAY_MS = 600

function readAutoPreview(): boolean {
  try { return localStorage.getItem(autoPreviewKey) === "1" } catch { return false }
}

/**
 * Ephemeral browser-only preview. No package lookup, upload or server execution. Runs on click, or
 * with Auto on, after every edit (including AI diffs) and encounter selection change.
 */
export function LuaInstancePreview({ panel, instanceId, encounterIds, events, units, onAskAssistant }: LuaInstancePreviewProps) {
  const [run, setRun] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [auto, setAuto] = useState(readAutoPreview)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const selection = JSON.stringify(encounterIds)
  const safeMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("safe") === "1"

  // With Auto off an input change clears the result; with Auto on the old result stays visible until
  // the debounced re-run replaces it.
  const inputsChanged = useEffectEvent(() => {
    if (!auto) { setRun(null); return undefined }
    const timer = setTimeout(() => void start(), AUTO_PREVIEW_DELAY_MS)
    return () => clearTimeout(timer)
  })

  // Invalidate asynchronous data on every input/provider change.
  useEffect(() => {
    const generationRef = generation
    const controllerRef = controller
    generationRef.current++
    controllerRef.current?.abort()
    controllerRef.current = null
    setBusy(false)
    setError("")
    const cancelTimer = inputsChanged()
    return () => { cancelTimer?.(); generationRef.current++; controllerRef.current?.abort(); controllerRef.current = null }
  }, [panel, instanceId, selection, events, safeMode])

  function abortPending() {
    generation.current++
    controller.current?.abort()
    controller.current = null
    setBusy(false)
    setError("")
  }

  function cancel() {
    abortPending()
    setRun(null)
  }

  function toggleAuto(next: boolean) {
    setAuto(next)
    try { localStorage.setItem(autoPreviewKey, next ? "1" : "0") } catch { /* per-viewer preference only */ }
    if (next && !busy && !current) void start()
  }

  async function start() {
    abortPending()
    if (safeMode) return
    if (!instanceId || !panel.sources[panel.entrypoint] ||
      Object.values(panel.sources).some(source => source.includes("\0") || new TextEncoder().encode(source).length > 64 * 1024) ||
      panel.streams.some(stream => !PANEL_STREAMS.includes(stream)) || panel.capabilities.some(cap => cap !== "ui" && cap !== "input")) {
      setError("Select an instance and provide a supported unsaved module package")
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
      const streams = await loadPreviewStreams(events, instanceId, panel, encounterIds, abort.signal)
      if (abort.signal.aborted || generation.current !== id) return
      setRun({ id, panel, instanceId, selection, encounterIds: [...encounterIds], streams })
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

  const current = run && run.panel === panel && run.instanceId === instanceId && run.selection === selection
  // A stale result only stays on screen while Auto is about to replace it.
  const visible = run && !safeMode && (current || auto) ? run : null
  return <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Unsaved module instance preview">
    {safeMode ? <p className="text-xs">Module preview is disabled by ?safe=1.</p> : <>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`} type="button" disabled={busy || !instanceId || !panel.sources[panel.entrypoint]} onClick={() => void start()}>{busy ? "Loading events…" : run ? "Re-run preview" : "Run preview"}</button>
        {(busy || run) && <button className={button} type="button" onClick={cancel}>{busy ? "Cancel" : "Clear"}</button>}
        <label className="flex items-center gap-1.5 text-xs" title="Re-run the preview automatically after edits, AI changes and encounter selection changes">
          <Switch size="sm" checked={auto} onCheckedChange={toggleAuto} aria-label="Auto preview" /> Auto
        </label>
        {visible && !current && <span role="status" className="text-[11px] text-muted-foreground">{busy ? "Updating…" : "Waiting for changes to settle…"}</span>}
        <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground" title={`Streams: ${panel.streams.join(", ") || "none"}. Nothing is uploaded or published.`}>{panel.streams.length === 1 ? `${panel.streams[0]} events` : `${panel.streams.length} streams`} · runs locally</span>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {visible && <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background transition-opacity ${current ? "" : "opacity-60"}`}>
        <LuaPanelHost key={visible.id} entrypoint={visible.panel.entrypoint} sources={visible.panel.sources} streams={visible.panel.streams} streamScope={visible.panel.streamScope}
          maxEvents={visible.panel.maxEvents} units={units} capabilities={visible.panel.capabilities} eventStreams={visible.streams} encounterIds={visible.encounterIds} assets={assetUrls} onAskAssistant={onAskAssistant} /></div>}
    </>}
  </section>
}
