import { useEffect, useEffectEvent, useState } from "react"
import type { PanelPackage } from "../Guides/package/panelLoader"
import type { PanelUnits } from "../Guides/runtime/panelUnits"
import { connectModuleDev, MODULE_DEV_ORIGIN } from "./localModuleBridge"
import { LuaInstancePreview } from "./LuaInstancePreview"
import { loadPreviewStreams, type PreviewStreamProvider } from "./previewStream"
import { runPreview } from "./previewRun"

interface Props {
  token: string
  instanceId: string
  encounterIds: readonly string[]
  units?: PanelUnits
  events: PreviewStreamProvider
}

export function LocalModuleDev({ token, instanceId, encounterIds, units, events }: Props) {
  const [approved, setApproved] = useState(false)
  const [connectionError, setConnectionError] = useState("")
  const [local, setLocal] = useState<{ panel: PanelPackage | null; revision: string; error?: string } | null>(null)
  const safeMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("safe") === "1"
  const context = useEffectEvent(() => ({ instanceId, encounterIds: [...encounterIds] }))
  const preview = useEffectEvent(async (panel: PanelPackage, selected: { instanceId: string; encounterIds: readonly string[] }, signal: AbortSignal) => {
    if (!selected.instanceId || !selected.encounterIds.length) throw new Error("Select an instance and encounters in Chronicle's Preview pane first")
    const streams = await loadPreviewStreams(events, selected.instanceId, panel, selected.encounterIds, signal)
    return runPreview({ panel, streams, encounterIds: selected.encounterIds, units }, signal)
  })
  useEffect(() => {
    if (!approved || safeMode) return
    const controller = new AbortController()
    void connectModuleDev({ token, signal: controller.signal, context: () => context(),
      onPackage: (panel, revision, error) => setLocal({ panel, revision, error }),
      preview: (panel, selected, signal) => preview(panel, selected, signal),
    }).catch(error => { if (!controller.signal.aborted) setConnectionError(error instanceof Error ? error.message : "Connection failed") })
    return () => controller.abort()
  }, [approved, safeMode, token])

  if (safeMode) return <p className="text-xs">Local development is disabled by ?safe=1.</p>
  return <section aria-label="Local module development" className="flex min-h-0 flex-1 flex-col gap-3">
    <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
      <p className="font-semibold">Local module development</p>
      <p className="mt-1">Connect to {MODULE_DEV_ORIGIN} to preview local Lua files. Your local tools and agent may run previews and read rendered output, errors, player names, and encounter context. Chronicle cookies and raw event streams are not sent to the dev server.</p>
      <p className="mt-1 text-muted-foreground">Local files are separate from the browser editor. Save to main and Tag release still refer to the browser editor, not these local files. Nothing here uploads or releases your module.</p>
      {!approved ? <button type="button" className="mt-2 rounded-md border px-3 py-1.5 hover:bg-accent" onClick={() => { setConnectionError(""); setApproved(true) }}>Connect local dev server</button>
        : <button type="button" className="mt-2 rounded-md border px-3 py-1.5 hover:bg-accent" onClick={() => { setApproved(false); setLocal(null); setConnectionError("") }}>Disconnect</button>}
      {approved && !local && !connectionError && <p role="status" className="mt-2">Connecting… Allow local-network access if your browser asks.</p>}
      {connectionError && <p role="alert" className="mt-2 text-destructive">{connectionError}. Check npm run dev, its allowed origin, and browser local-network permissions. Disconnect to retry.</p>}
      {local && <p role="status" className="mt-2 font-mono">Local source: {local.revision.slice(0, 12)}</p>}
      {local?.error && <p role="alert" className="mt-2 text-destructive">{local.error}</p>}
    </div>
    {approved && !connectionError && local?.panel && instanceId && encounterIds.length > 0 &&
      <LuaInstancePreview panel={local.panel} instanceId={instanceId} encounterIds={encounterIds} events={events} units={units} autoRun />}
  </section>
}
