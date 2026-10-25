import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useInstanceEventsContext } from "@/hooks/instanceEvents"
import { loadPanelPackage } from "../../../Guides/package/panelLoader"
import type { EventsPanelProps } from "../EventsPanel"
import { PanelSelector } from "../PanelSelector"
import { LuaPanelHost } from "./LuaPanelHost"
import { parseLuaPanelRef } from "./luaPanelRegistry"

export default function LuaEventsPanel(props: EventsPanelProps) {
  const ref = parseLuaPanelRef(props.panelType)
  const { fetchStream } = useInstanceEventsContext()
  const packageQuery = useQuery({ queryKey: ["lua-panel-package", ref?.id, ref?.channel], enabled: !!ref,
    refetchInterval: 60_000, // A channel follows its latest published artifact without retaining old releases.
    queryFn: async ({ signal }) => {
      if (!ref) throw new Error("Invalid Lua panel reference")
      const response = await fetch(`/api/v1/lua-projects/${ref.id}/package?channel=${ref.channel}`, { signal })
      if (!response.ok) throw new Error(`Lua panel package unavailable (${response.status})`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      return loadPanelPackage(bytes)
    },
  })
  const panel = packageQuery.data
  const selectedIds = useMemo(() => [...(props.context.selectedEncounterIds ?? [])], [props.context.selectedEncounterIds])
  const [damage, setDamage] = useState<Uint8Array>()
  const [streamError, setStreamError] = useState<string>()
  useEffect(() => {
    if (!panel?.streams.includes("damage")) return
    let active = true
    fetchStream("damage").then((stream) => {
      if (stream.data.byteLength > 32_000_000) throw new Error("Damage stream exceeds Lua panel limit")
      if (active) { setDamage(stream.data.slice()); setStreamError(undefined) }
    }).catch((error: unknown) => { if (active) setStreamError(String(error)) })
    return () => { active = false; setDamage(undefined) }
  }, [panel, fetchStream])
  const assetUrls = useMemo(() => {
    const urls = new Map<string, string>()
    for (const [path, bytes] of panel?.assets ?? []) urls.set(path, URL.createObjectURL(new Blob([new Uint8Array(bytes)])))
    return urls
  }, [panel])
  useEffect(() => () => { for (const url of assetUrls.values()) URL.revokeObjectURL(url) }, [assetUrls])
  return <div className="flex h-full flex-col rounded-lg border border-border bg-card text-card-foreground">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm">
      <span className="truncate font-semibold">{panel?.name ?? "Lua panel"} <span className="text-xs text-muted-foreground">({ref?.channel})</span></span>
      <PanelSelector value={props.panelType} onChange={props.onPanelTypeChange} />
    </div>
    {packageQuery.isPending ? <div className="p-4 text-sm">Loading Lua panel...</div> :
      packageQuery.error || streamError ? <div role="alert" className="p-4 text-sm text-destructive">{String(packageQuery.error ?? streamError)}</div> :
      panel && (panel.streams.includes("damage") && !damage ? <div className="p-4 text-sm">Loading damage...</div> :
        <LuaPanelHost key={`${ref?.id}:${ref?.channel}`} entrypoint={panel.entrypoint} sources={panel.sources} streams={panel.streams}
          damageStream={damage} encounterIds={selectedIds} assets={assetUrls} />)}
  </div>
}
