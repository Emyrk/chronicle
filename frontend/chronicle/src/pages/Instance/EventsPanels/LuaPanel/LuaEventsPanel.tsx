import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useInstanceEventsContext } from "@/hooks/instanceEvents"
import { loadPanelPackage } from "../../../Guides/package/panelLoader"
import { getPublicProject, publicPackageURL } from "../../../LuaProjects/api"
import type { EventsPanelProps } from "../EventsPanel"
import { PanelSelector } from "../PanelSelector"
import { LuaPanelHost } from "./LuaPanelHost"
import { parseLuaPanelRef } from "./luaPanelRegistry"

export default function LuaEventsPanel(props: EventsPanelProps) {
  const ref = parseLuaPanelRef(props.panelType)
  const { fetchStream } = useInstanceEventsContext()
  const channelQuery = useQuery({
    queryKey: ["lua-panel-channel", ref?.id, ref?.channel],
    enabled: !!ref,
    // Resolve the channel once per page load. Do not swap a running Lua worker
    // when a release changes; a browser refresh creates a fresh query client.
    staleTime: "static",
    gcTime: Infinity, // Keep the resolved hash across panel remounts until page refresh.
    queryFn: ({ signal }) => {
      if (!ref) throw new Error("Invalid Lua panel reference")
      return getPublicProject(ref.id, ref.channel, signal)
    },
  })
  const hash = ref?.channel === "unstable" ? channelQuery.data?.unstable?.sha256 : channelQuery.data?.stable?.sha256
  const packageQuery = useQuery({
    queryKey: ["lua-panel-package", ref?.id, hash], enabled: !!ref && !!hash,
    staleTime: Infinity, // Hash-addressed bytes never change while published.
    gcTime: Infinity, // Keep bytes available if the channel rotates before a panel remount.
    queryFn: async ({ signal }) => {
      if (!ref || !hash) throw new Error("Lua channel has no published package")
      const response = await fetch(publicPackageURL(ref.id, hash), { signal })
      if (!response.ok) throw new Error(`Lua panel package unavailable (${response.status})`)
      return loadPanelPackage(new Uint8Array(await response.arrayBuffer()))
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
    {channelQuery.isPending || (hash && packageQuery.isPending) ? <div className="p-4 text-sm">Loading Lua panel...</div> :
      channelQuery.error || packageQuery.error || streamError || !hash ? <div role="alert" className="p-4 text-sm text-destructive">{String(channelQuery.error ?? packageQuery.error ?? streamError ?? "Channel not published")}</div> :
      panel && (panel.streams.includes("damage") && !damage ? <div className="p-4 text-sm">Loading damage...</div> :
        <LuaPanelHost key={`${ref?.id}:${hash}`} entrypoint={panel.entrypoint} sources={panel.sources} streams={panel.streams} streamScope={panel.streamScope} maxEvents={panel.maxEvents} capabilities={panel.capabilities}
          damageStream={damage} encounterIds={selectedIds} assets={assetUrls} />)}
  </div>
}
