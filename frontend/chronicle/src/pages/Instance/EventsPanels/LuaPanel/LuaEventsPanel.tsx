import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useInstanceEventsContext } from "@/hooks/instanceEvents"
import { loadPanelPackage } from "../../../Guides/package/panelLoader"
import { channelSha, getPublicProject, publicPackageURL } from "../../../LuaProjects/api"
import type { EventsPanelProps } from "../EventsPanel"
import { Button } from "@/components/ui/button"
import { Filter } from "lucide-react"
import { useSyncModeContextOptional } from "../../SyncModeContext"
import { PanelFilterEditor } from "../PanelFilterEditor"
import type { PanelFilter } from "../processors/filters"
import type { ProcessorContext } from "../processorTypes"
import { toSerializableContext } from "../usePanelAggregation"
import { PanelCard } from "../PanelCard"
import { PanelSelector } from "../PanelSelector"
import { usePanelTiming, usePanelTimingContext } from "../PanelTimingContext"
import { buildPanelUnits } from "../../../Guides/runtime/panelUnits"
import type { EventStreams } from "../../../Guides/runtime/panelEvents"
import { LuaPanelHost, type LuaPanelRunMetrics } from "./LuaPanelHost"
import { useTimeRangeContextOptional } from "../../TimeRangeContext"
import type { PanelTimeRange } from "../../../Guides/runtime/runtime"
import { parseLuaPanelRef } from "./luaPanelRegistry"

export default function LuaEventsPanel(props: EventsPanelProps) {
  // Module identity owns its local edits. Never carry filters into another module.
  return <LuaEventsPanelContent key={props.panelType} {...props} />
}

function LuaEventsPanelContent(props: EventsPanelProps) {
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
  const isSyncActive = useSyncModeContextOptional()?.enabled === true
  const filteringSupported = panel?.filterMode === "prefilter" || panel?.filterMode === "manual"
  const [filters, setFilters] = useState<PanelFilter[]>(props.seedFilters ?? [])
  const [pendingFilters, setPendingFilters] = useState<PanelFilter[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [appliedSeedVersion, setAppliedSeedVersion] = useState(props.seedFiltersVersion)
  // Only explicit layout imports/casts replace edits, not new array references.
  // An empty seed is meaningful: it clears both applied and buffered filters.
  if (props.seedFiltersVersion !== appliedSeedVersion) {
    setAppliedSeedVersion(props.seedFiltersVersion)
    setFilters(props.seedFilters ?? [])
    setPendingFilters(null)
    setEditing(false)
  }
  const editFilters = (next: PanelFilter[]) => {
    setPendingFilters(next)
    props.onFiltersChange?.(next)
  }
  const closeEditor = () => {
    if (pendingFilters !== null) setFilters(pendingFilters)
    setPendingFilters(null)
    setEditing(false)
  }
  const resetFilters = () => {
    setFilters([])
    setPendingFilters(null)
    props.onFiltersChange?.([])
  }
  const filterContext = useMemo<ProcessorContext | undefined>(() => {
    if (!filteringSupported) return undefined
    const mapped = toSerializableContext(props.context, null, null)
    // Deliberately copy only clone-safe compiler inputs, never PanelContext's callbacks.
    return {
      players: mapped.players,
      units: mapped.units,
      vehicleControlIntervals: mapped.vehicleControlIntervals,
      selectedEncounterIds: new Set(mapped.selectedEncounterIds),
      entitySelection: {
        playerIds: new Set(mapped.entitySelection.playerIds),
        enemyIds: new Set(mapped.entitySelection.enemyIds),
      },
      filters,
    }
  }, [filteringSupported, props.context, filters])
  const { players, units: instanceUnits } = props.context.instance
  const units = useMemo(() => buildPanelUnits(players, instanceUnits), [players, instanceUnits])
  const selectedIds = useMemo(() => [...(props.context.selectedEncounterIds ?? [])], [props.context.selectedEncounterIds])
  const [eventStreams, setEventStreams] = useState<EventStreams>()
  const [streamError, setStreamError] = useState<string>()
  const [fetchMs, setFetchMs] = useState(0)
  useEffect(() => {
    if (!panel) return
    // Ownership updates support filter evaluation, but only panel.streams are delivered to Lua.
    const requestedStreams = filteringSupported
      ? [...new Set([...panel.streams, "unit_classification" as const])]
      : panel.streams
    if (!requestedStreams.length) return
    let active = true
    const started = performance.now()
    // slice() so posting to the worker clones only this stream, not a larger buffer it may view.
    Promise.all(requestedStreams.map(async (type) => [type, (await fetchStream(type)).data.slice()] as const)).then((entries) => {
      if (active) { setFetchMs(performance.now() - started); setEventStreams(Object.fromEntries(entries)); setStreamError(undefined) }
    }).catch((error: unknown) => { if (active) setStreamError(String(error)) })
    return () => { active = false; setEventStreams(undefined) }
  }, [panel, fetchStream, filteringSupported])
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
  // Chronicle.GetTimeRange / SetTimeRange map onto the page's time range controller.
  const pageTimeRange = useTimeRangeContextOptional()
  const rangeStartMs = pageTimeRange?.enabled ? pageTimeRange.startOffsetMs : null
  const rangeEndMs = pageTimeRange?.enabled ? pageTimeRange.endOffsetMs : null
  // LuaPanelHost reacts to the two bounds, not this object's identity.
  const timeRange: PanelTimeRange | null = rangeStartMs !== null || rangeEndMs !== null ? { startMs: rangeStartMs, endMs: rangeEndMs } : null
  const setRange = pageTimeRange?.setRange
  const resetRange = pageTimeRange?.reset
  const totalDurationMs = pageTimeRange?.totalDurationMs ?? 0
  const onSetTimeRange = useMemo(() => setRange && resetRange ? (range: PanelTimeRange | null) => {
    if (!range) return resetRange()
    // Clamp to the selected encounters so a module cannot select past the end of the fight.
    const clamp = (value: number | null) => value === null || totalDurationMs <= 0 ? value : Math.min(value, totalDurationMs)
    setRange(clamp(range.startMs), clamp(range.endMs))
  } : undefined, [setRange, resetRange, totalDurationMs])
  const showEditor = editing && filteringSupported && !isSyncActive
  let content
  if (channelQuery.isPending || (hash && packageQuery.isPending)) content = <div className="p-4 text-sm">Loading module...</div>
  else if (channelQuery.error || packageQuery.error || streamError || !hash) content = <div role="alert" className="p-4 text-sm text-destructive">{String(channelQuery.error ?? packageQuery.error ?? streamError ?? "Channel not published")}</div>
  else if (panel) content = (panel.streams.length > 0 || filteringSupported) && !eventStreams ? <div className="p-4 text-sm">Loading events...</div> :
    <LuaPanelHost key={`${ref?.id}:${hash}`} entrypoint={panel.entrypoint} sources={panel.sources} streams={panel.streams} streamScope={panel.streamScope} maxEvents={panel.maxEvents} capabilities={panel.capabilities}
      filterMode={panel.filterMode} filterContext={filterContext}
      eventStreams={eventStreams} encounterIds={selectedIds} assets={assetUrls} units={units} onMetrics={onMetrics}
      timeRange={timeRange} onSetTimeRange={onSetTimeRange} />
  return <PanelCard flipped={false} back={null} front={<>
    <div className="flex min-w-0 items-center justify-between gap-2">
      <PanelSelector value={props.panelType} onChange={props.onPanelTypeChange} />
      {filteringSupported && <Button size="sm" variant="ghost" disabled={isSyncActive}
        aria-label="Edit panel filters" title={isSyncActive ? "Filter editing is unavailable during Sync" : "Edit panel filters"}
        onClick={() => setEditing(true)}><Filter className="h-4 w-4" /></Button>}
    </div>
    {showEditor && <div className="min-h-0 flex-1 overflow-auto styled-scrollbar">
      <PanelFilterEditor panelLabel={panel?.name} filters={pendingFilters ?? filters}
        onChange={editFilters} onClose={closeEditor} onReset={resetFilters} />
    </div>}
    <div className={showEditor ? "hidden" : "relative flex min-h-0 flex-1 flex-col"}>{content}</div>
  </>} />
}
