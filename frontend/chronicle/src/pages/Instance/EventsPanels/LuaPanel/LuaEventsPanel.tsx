import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useInstanceEventsContext } from "@/hooks/instanceEvents"
import { loadPanelPackage } from "../../../Guides/package/panelLoader"
import { channelSha, getPublicProject, publicPackageURL } from "../../../LuaProjects/api"
import type { EventsPanelProps } from "../EventsPanel"
import { PanelSelector } from "../PanelSelector"
import { usePanelTiming, usePanelTimingContext } from "../PanelTimingContext"
import { buildPanelUnits } from "../../../Guides/runtime/panelUnits"
import type { EventStreams } from "../../../Guides/runtime/panelEvents"
import { LuaPanelHost, type LuaPanelRunMetrics } from "./LuaPanelHost"
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
      if (!ref) throw new Error("Invalid module reference")
      return getPublicProject(ref.id, ref.channel, signal)
    },
  })
  const hash = channelQuery.data && ref ? channelSha(channelQuery.data, ref.channel) : undefined
  const packageQuery = useQuery({
    queryKey: ["lua-panel-package", ref?.id, hash], enabled: !!ref && !!hash,
    staleTime: Infinity, // Hash-addressed bytes never change while published.
    gcTime: Infinity, // Keep bytes available if the channel rotates before a panel remount.
    queryFn: async ({ signal }) => {
      if (!ref || !hash) throw new Error("This module has no published release on this channel")
      const response = await fetch(publicPackageURL(ref.id, hash), { signal })
      if (!response.ok) throw new Error(`Module package unavailable (${response.status})`)
      return loadPanelPackage(new Uint8Array(await response.arrayBuffer()))
    },
  })
  const panel = packageQuery.data
  const { players, units: instanceUnits } = props.context.instance
  const units = useMemo(() => buildPanelUnits(players, instanceUnits), [players, instanceUnits])
  const selectedIds = useMemo(() => [...(props.context.selectedEncounterIds ?? [])], [props.context.selectedEncounterIds])
  const [eventStreams, setEventStreams] = useState<EventStreams>()
  const [streamError, setStreamError] = useState<string>()
  const [fetchMs, setFetchMs] = useState(0)
  useEffect(() => {
    if (!panel?.streams.length) return
    let active = true
    const started = performance.now()
    // slice() so posting to the worker clones only this stream, not a larger buffer it may view.
    Promise.all(panel.streams.map(async (type) => [type, (await fetchStream(type)).data.slice()] as const)).then((entries) => {
      if (active) { setFetchMs(performance.now() - started); setEventStreams(Object.fromEntries(entries)); setStreamError(undefined) }
    }).catch((error: unknown) => { if (active) setStreamError(String(error)) })
    return () => { active = false; setEventStreams(undefined) }
  }, [panel, fetchStream])
  // Report like built-in panels so Lua panels show up in the Metrics panel and the page's load timer.
  const reportPanelMetrics = usePanelTimingContext()?.reportPanelMetrics
  const [done, setDone] = useState(false)
  usePanelTiming(`panel-${props.panelIndex}`, done)
  const onMetrics = useCallback((run: LuaPanelRunMetrics) => {
    setDone(true)
    reportPanelMetrics?.({
      panelKey: `panel-${props.panelIndex}`, panelId: String(props.panelType), panelLabel: `${panel?.name ?? "Module"} (module)`,
      panelIndex: props.panelIndex, streams: panel?.streams ?? [],
      streamBytes: Object.fromEntries(Object.entries(eventStreams ?? {}).map(([type, data]) => [type, data.byteLength])), totalStreamBytes: run.bytes,
      totalEvents: run.events, processingTimeMs: run.totalMs, streamProcessingTimeMs: run.luaMs + run.completeMs,
      serializationTimeMs: run.uiMs, deserializationTimeMs: run.drawMs, wallTimeMs: fetchMs + run.wallMs,
      queueWaitMs: run.startupMs, fetchTimeMs: fetchMs, updatedAtMs: performance.now(),
    })
  }, [reportPanelMetrics, props.panelIndex, props.panelType, panel?.name, panel?.streams, eventStreams, fetchMs])
  const assetUrls = useMemo(() => {
    const urls = new Map<string, string>()
    for (const [path, bytes] of panel?.assets ?? []) urls.set(path, URL.createObjectURL(new Blob([new Uint8Array(bytes)])))
    return urls
  }, [panel])
  useEffect(() => () => { for (const url of assetUrls.values()) URL.revokeObjectURL(url) }, [assetUrls])
  return <div data-panel-explorer-host className="relative flex h-full flex-col rounded-lg border border-border bg-card text-card-foreground">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm">
      <span className="truncate font-semibold">{panel?.name ?? "Module"} <span className="text-xs text-muted-foreground">({ref?.channel})</span></span>
      <PanelSelector value={props.panelType} onChange={props.onPanelTypeChange} />
    </div>
    {channelQuery.isPending || (hash && packageQuery.isPending) ? <div className="p-4 text-sm">Loading module...</div> :
      channelQuery.error || packageQuery.error || streamError || !hash ? <div role="alert" className="p-4 text-sm text-destructive">{String(channelQuery.error ?? packageQuery.error ?? streamError ?? "Channel not published")}</div> :
      panel && (panel.streams.length > 0 && !eventStreams ? <div className="p-4 text-sm">Loading events...</div> :
        <LuaPanelHost key={`${ref?.id}:${hash}`} entrypoint={panel.entrypoint} sources={panel.sources} streams={panel.streams} streamScope={panel.streamScope} maxEvents={panel.maxEvents} capabilities={panel.capabilities}
          eventStreams={eventStreams} encounterIds={selectedIds} assets={assetUrls} units={units} onMetrics={onMetrics} />)}
  </div>
}
