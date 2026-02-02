/**
 * All Activity Debug panel - Shows raw events with stream type toggles
 */

import { useState, useMemo, useCallback } from "react";
import { Activity, Swords, Heart, Zap, Wand2, Sparkles, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { ScrollArea, ScrollBar } from "@/components/ui/ScrollArea/ScrollArea";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import type { PanelDefinition, PanelRenderProps, PanelContext } from "./types";
import { allActivityProcessor, type AllActivityState, type RawDebugEvent, type EncounterMeta, type ResourceType } from "./processors";
import type { StreamType } from "@/hooks/instanceEvents";
import { usePanelAggregation } from "./usePanelAggregation";

// Resource type color mapping (WoW-inspired colors)
const RESOURCE_COLORS: Record<ResourceType, string> = {
  Health: "text-green-500",
  Mana: "text-blue-400",
  Rage: "text-red-400",
  Energy: "text-yellow-400",
  Focus: "text-orange-400",
  Happiness: "text-pink-400",
};

// Stream type configurations
const STREAM_CONFIG: Record<StreamType, { icon: React.ElementType; color: string; label: string }> = {
  damage: { icon: Swords, color: "text-red-500", label: "Damage" },
  heal: { icon: Heart, color: "text-green-500", label: "Healing" },
  resource_change: { icon: Zap, color: "text-yellow-500", label: "Resource" },
  extra_attack: { icon: Swords, color: "text-orange-500", label: "Extra Attack" },
  slain: { icon: Activity, color: "text-gray-500", label: "Slain" },
  cast: { icon: Wand2, color: "text-purple-500", label: "Cast" },
  aura: { icon: Sparkles, color: "text-cyan-500", label: "Aura" },
};

interface StreamToggleProps {
  streamType: StreamType;
  enabled: boolean;
  count: number;
  onToggle: () => void;
}

function StreamToggle({ streamType, enabled, count, onToggle }: StreamToggleProps) {
  const config = STREAM_CONFIG[streamType];
  const Icon = config.icon;
  
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all cursor-pointer",
        enabled 
          ? `${config.color} bg-muted` 
          : "text-muted-foreground/50 hover:text-muted-foreground"
      )}
      title={`${config.label}: ${formatNumber(count)} events`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className={cn("font-mono", !enabled && "line-through")}>{formatNumber(count)}</span>
    </button>
  );
}

interface RawEventRowProps {
  event: RawDebugEvent;
  index: number;
}

function RawEventRow({ event, index }: RawEventRowProps) {
  const config = STREAM_CONFIG[event.streamType];
  const Icon = config.icon;
  
  // Format timestamp as +XXXms
  const timeStr = `+${event.offsetMilli.toString().padStart(6, ' ')}ms`;
  
  // Determine amount color: use resource-specific color for resource_change, stream color otherwise
  const amountColor = event.resourceType 
    ? RESOURCE_COLORS[event.resourceType] 
    : config.color;
  
  const amountElement = (
    <span className={cn("w-12 text-right shrink-0", amountColor)}>{event.amount.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
  );
  
  return (
    <div className="flex items-center gap-2 text-xs font-mono py-0.5 border-b border-border/30 hover:bg-muted/30">
      <span className="text-muted-foreground w-6 text-right shrink-0">{index}</span>
      <Icon className={cn("h-3 w-3 shrink-0", config.color)} />
      <span className="text-muted-foreground w-20 shrink-0">{timeStr}</span>
      <span className="text-blue-400 w-24 shrink-0 truncate" title={event.sourceName}>{event.sourceName}</span>
      <span className="text-muted-foreground shrink-0">→</span>
      <span className="text-purple-400 w-24 shrink-0 truncate" title={event.target}>{event.targetName}</span>
      {event.extra ? (
        <Tooltip>
          <TooltipTrigger asChild>{amountElement}</TooltipTrigger>
          <TooltipContent side="top">{event.extra}</TooltipContent>
        </Tooltip>
      ) : (
        amountElement
      )}
    </div>
  );
}

// ============================================================================
// Pagination Controls
// ============================================================================

const PAGE_SIZE = 100;

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalEvents: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

function PaginationControls({
  currentPage,
  totalPages,
  totalEvents,
  onPageChange,
  loading,
}: PaginationControlsProps) {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;
  
  const startEvent = (currentPage - 1) * PAGE_SIZE + 1;
  const endEvent = Math.min(currentPage * PAGE_SIZE, totalEvents);
  
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {totalEvents > 0 ? (
          <>
            <span className="font-medium text-foreground">{startEvent.toLocaleString()}</span>
            {" - "}
            <span className="font-medium text-foreground">{endEvent.toLocaleString()}</span>
            {" of "}
            <span className="font-medium text-foreground">{totalEvents.toLocaleString()}</span>
          </>
        ) : (
          "No events"
        )}
      </span>
      
      <div className="flex items-center gap-0.5 ml-2">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={!canGoPrev || loading}
          className={cn(
            "p-1 rounded hover:bg-muted transition-colors",
            (!canGoPrev || loading) && "opacity-30 cursor-not-allowed"
          )}
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrev || loading}
          className={cn(
            "p-1 rounded hover:bg-muted transition-colors",
            (!canGoPrev || loading) && "opacity-30 cursor-not-allowed"
          )}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        
        <span className="px-2 text-muted-foreground tabular-nums">
          {currentPage} / {Math.max(1, totalPages)}
        </span>
        
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext || loading}
          className={cn(
            "p-1 rounded hover:bg-muted transition-colors",
            (!canGoNext || loading) && "opacity-30 cursor-not-allowed"
          )}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={!canGoNext || loading}
          className={cn(
            "p-1 rounded hover:bg-muted transition-colors",
            (!canGoNext || loading) && "opacity-30 cursor-not-allowed"
          )}
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Internal render component that handles data display (no pagination control).
 * This is used by the wrapper that manages aggregation with pagination.
 */
interface AllActivityContentProps {
  result: AllActivityState | null;
  totalEvents: number;
  processingTimeMs: number | null;
  loading: boolean;
  processing: boolean;
  error: Error | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  enabledStreams: Set<StreamType>;
  onToggleStream: (stream: StreamType) => void;
}

function AllActivityContent({
  result,
  totalEvents,
  processingTimeMs,
  loading,
  processing,
  error,
  currentPage,
  onPageChange,
  enabledStreams,
  onToggleStream,
}: AllActivityContentProps) {
  // Default state during loading
  const emptyByStream = { damage: [], heal: [], resource_change: [], extra_attack: [], slain: [], cast: [], aura: [] };
  const emptyEncounters = new Map<string, EncounterMeta>();
  const safeResult = result ?? {
    counts: new Map<string, number>(),
    rawEventsByStream: emptyByStream,
    streamCounts: { damage: 0, heal: 0, resource_change: 0, extra_attack: 0, slain: 0, cast: 0, aura: 0 },
    encounters: emptyEncounters,
    totalProcessed: 0,
    eventsSkipped: 0,
    eventsCaptured: 0,
  };
  
  // Get encounters map (handle both Map and deserialized object)
  const encounters: Map<string, EncounterMeta> = safeResult.encounters instanceof Map 
    ? safeResult.encounters 
    : new Map<string, EncounterMeta>();
  
  // Merge all captured events (processor already filtered by enabled streams)
  const rawEventsByStream = safeResult.rawEventsByStream ?? emptyByStream;
  const allCapturedEvents = [
    ...rawEventsByStream.damage,
    ...rawEventsByStream.heal,
    ...rawEventsByStream.resource_change,
    ...rawEventsByStream.cast,
    ...rawEventsByStream.aura,
  ];
  
  // Sort by encounter first, then by index within encounter to reconstruct true event order
  const sortedEvents = allCapturedEvents.sort((a, b) => {
    if (a.encounterID !== b.encounterID) {
      return a.encounterID.localeCompare(b.encounterID);
    }
    return a.index - b.index;
  });
  
  // Calculate pagination info from the result
  const totalProcessed = safeResult.totalProcessed;
  const totalPages = Math.ceil(totalProcessed / PAGE_SIZE);

  return (
    <div>
      {/* Stream toggles */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Streams:</span>
        {(["damage", "heal", "resource_change", "cast", "aura"] as StreamType[]).map((stream) => (
          <StreamToggle
            key={stream}
            streamType={stream}
            enabled={enabledStreams.has(stream)}
            count={safeResult.streamCounts[stream]}
            onToggle={() => onToggleStream(stream)}
          />
        ))}
      </div>
      
      {/* Stats row with pagination */}
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground mb-2 flex-wrap">
        <div className="flex items-center gap-4">
          <span>
            Total Processed: <span className="font-medium text-foreground">{formatNumber(totalEvents)}</span>
          </span>
          {processingTimeMs !== null && (
            <span className="text-blue-500">
              ({processingTimeMs.toFixed(0)}ms)
            </span>
          )}
          {(loading || processing) && (
            <span className="text-yellow-500 animate-pulse">
              {loading ? "Fetching..." : "Processing..."}
            </span>
          )}
        </div>
        
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalEvents={totalProcessed}
          onPageChange={onPageChange}
          loading={loading || processing}
        />
      </div>

      {error && (
        <div className="text-xs text-destructive mb-2">Error: {error.message}</div>
      )}
      
      {/* Raw events list */}
      <ScrollArea className="h-80 border rounded">
        <div className="p-1 min-w-max">
          {/* Header */}
          <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground py-1 border-b sticky top-0 bg-background">
            <span className="w-6 text-right shrink-0">#</span>
            <span className="w-3 shrink-0"></span>
            <span className="w-20 shrink-0">Time</span>
            <span className="w-24 shrink-0">Source</span>
            <span className="shrink-0"></span>
            <span className="w-24 shrink-0">Target</span>
            <span className="w-12 text-right shrink-0">Amount</span>
          </div>
          
          {sortedEvents.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              {loading || processing ? "Loading events..." : "No events to display. Enable some streams."}
            </div>
          ) : (
            (() => {
              let lastEncounterID: string | null = null;
              // Calculate global index offset for display
              const globalOffset = (currentPage - 1) * PAGE_SIZE;
              return sortedEvents.map((event, idx) => {
                const showHeader = event.encounterID !== lastEncounterID;
                lastEncounterID = event.encounterID;
                const encounterMeta = encounters.get(event.encounterID);
                const timestamp = encounterMeta 
                  ? new Date(encounterMeta.firstTimestamp).toLocaleTimeString()
                  : "???";
                
                return (
                  <div key={`${event.encounterID}-${event.streamType}-${event.index}`}>
                    {showHeader && (
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-cyan-400 py-1 mt-1 border-t border-cyan-400/30 bg-cyan-400/5">
                        <span className="px-1">📍 Encounter: {event.encounterID.slice(0, 8)}... @ {timestamp}</span>
                      </div>
                    )}
                    <RawEventRow event={event} index={globalOffset + idx} />
                  </div>
                );
              });
            })()
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

/**
 * Wrapper component that manages its own pagination state and aggregation.
 * This is necessary because pagination changes need to trigger re-processing in the worker.
 */
interface AllActivityWrapperProps {
  context: PanelContext;
}

const DEFAULT_ENABLED_STREAMS = new Set<StreamType>(["damage", "heal", "resource_change"]);

function AllActivityWrapper({ context }: AllActivityWrapperProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [enabledStreams, setEnabledStreams] = useState<Set<StreamType>>(DEFAULT_ENABLED_STREAMS);
  
  // Track previous encounter key to reset page when encounters change
  // Using the React-approved pattern for "adjusting state when a prop changes"
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const encounterKey = context.selectedEncounterIds.join(",");
  const [prevEncounterKey, setPrevEncounterKey] = useState(encounterKey);
  if (prevEncounterKey !== encounterKey) {
    setPrevEncounterKey(encounterKey);
    setCurrentPage(1);
  }
  
  // Create context with pagination and enabled streams
  const paginatedContext = useMemo((): PanelContext => ({
    ...context,
    pagination: {
      offset: (currentPage - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      enabledStreams: Array.from(enabledStreams),
    },
  }), [context, currentPage, enabledStreams]);
  
  // Use aggregation with paginated context
  const {
    loading,
    processing,
    error,
    result,
    totalEvents,
    processingTimeMs,
  } = usePanelAggregation({
    panel: allActivityProcessor as PanelDefinition<AllActivityState>,
    context: paginatedContext,
  });
  
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);
  
  const handleToggleStream = useCallback((stream: StreamType) => {
    setEnabledStreams((prev) => {
      const next = new Set(prev);
      if (next.has(stream)) {
        next.delete(stream);
      } else {
        next.add(stream);
      }
      return next;
    });
    // Reset to page 1 when streams change
    setCurrentPage(1);
  }, []);
  
  return (
    <AllActivityContent
      result={result}
      totalEvents={totalEvents}
      processingTimeMs={processingTimeMs}
      loading={loading}
      processing={processing}
      error={error}
      currentPage={currentPage}
      onPageChange={handlePageChange}
      enabledStreams={enabledStreams}
      onToggleStream={handleToggleStream}
    />
  );
}

/**
 * Legacy render function that simply extracts context and delegates to wrapper.
 * This maintains compatibility with the PanelDefinition interface.
 */
function AllActivityRender(props: PanelRenderProps<AllActivityState>) {
  // The wrapper manages its own aggregation with pagination
  return <AllActivityWrapper context={props.context} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AllActivityPanel: PanelDefinition<AllActivityState, any> = {
  ...allActivityProcessor,
  label: "All Activity",
  icon: <Activity className="h-4 w-4" />,
  // This panel manages its own aggregation to support pagination
  selfManagesAggregation: true,
  
  render: (props: PanelRenderProps<AllActivityState>) => (
    <AllActivityRender {...props} />
  ),
};
