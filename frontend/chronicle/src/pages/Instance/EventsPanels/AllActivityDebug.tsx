/**
 * All Activity Debug panel - Shows raw events with stream type toggles
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Skull, Swords, Heart, Zap, Wand2, Sparkles, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X, Crosshair, Play, CircleX, Bubbles, WandSparkles, CircleFadingPlus, UserCheck, Ban, Shield, HeartPulse, FlaskConical } from "lucide-react";
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
  extra_attack: { icon: CircleFadingPlus, color: "text-orange-500", label: "Extra Attack" },
  ressurection: { icon: HeartPulse, color: "text-emerald-400", label: "Resurrection" },
  slain: { icon: Skull, color: "text-gray-500", label: "Slain" },
  aura: { icon: Sparkles, color: "text-cyan-500", label: "Aura" },
  spell_go: { icon: Crosshair, color: "text-amber-500", label: "Spell Go" },
  aura_cast: { icon: WandSparkles, color: "text-teal-500", label: "Aura Cast" },
  spell_start: { icon: Play, color: "text-lime-500", label: "Spell Start" },
  spell_fail: { icon: CircleX, color: "text-red-400", label: "Spell Fail" },
  unit_classification: { icon: Search, color: "text-indigo-500", label: "Classification" },
  combatant_info: { icon: UserCheck, color: "text-sky-400", label: "Combatant Info" },
  dispel: { icon: Bubbles, color: "text-violet-400", label: "Dispel" },
  interrupt: { icon: Ban, color: "text-rose-400", label: "Interrupt" },
  absorbed: { icon: Shield, color: "text-sky-400", label: "Absorbed" },
  companion_stats: { icon: Shield, color: "text-teal-400", label: "Companion Stats" },
  consume: { icon: FlaskConical, color: "text-fuchsia-400", label: "Consume" },

  cast: { icon: Wand2, color: "text-purple-500", label: "Cast" },
};
// --- Panel option encode/decode helpers for state persistence ---

const DEFAULT_ENABLED_STREAMS = new Set<StreamType>(["damage", "heal", "resource_change", "spell_go", "consume"]);

const STREAM_CODES: Record<StreamType, string> = {
  damage: "d", heal: "h", resource_change: "r", cast: "c",
  ressurection: "z",
  aura: "a", slain: "x", spell_go: "g", aura_cast: "u", spell_start: "ss", spell_fail: "sf",
  extra_attack: "e",
  unit_classification: "uc",
  combatant_info: "ci",
  dispel: "dp",
  interrupt: "int",
  absorbed: "ab",
  companion_stats: "cs",
  consume: "q",
};
const CODE_TO_STREAM = Object.fromEntries(
  Object.entries(STREAM_CODES).map(([k, v]) => [v, k as StreamType]),
) as Record<string, StreamType>;
const DEFAULT_STREAM_CODE = "dghqr"; // sorted code for DEFAULT_ENABLED_STREAMS

function encodeStreams(streams: Set<StreamType>): string {
  return [...streams].map((s) => STREAM_CODES[s]).sort().join("");
}
function decodeStreams(code: string): Set<StreamType> {
  const set = new Set<StreamType>();
  for (const ch of code) {
    const s = CODE_TO_STREAM[ch];
    if (s) set.add(s);
  }
  return set.size > 0 ? set : new Set(DEFAULT_ENABLED_STREAMS);
}

// Commas are the token separator, so escape them in filter values
function encodeFilterValue(v: string): string {
  return v.replace(/%/g, "%25").replace(/,/g, "%2C");
}
function decodeFilterValue(v: string): string {
  return v.replace(/%2C/gi, ",").replace(/%25/g, "%");
}

function parseAllActivityTokens(option: string | null | undefined) {
  const tokens = (option ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  let streams: Set<StreamType> | null = null;
  let abilityFilter = "";
  let sourceFilter = "";
  let targetFilter = "";
  let useLocalTime = false;
  for (const t of tokens) {
    if (t.startsWith("s:"))       streams = decodeStreams(t.slice(2));
    else if (t.startsWith("af:")) abilityFilter = decodeFilterValue(t.slice(3));
    else if (t.startsWith("sf:")) sourceFilter = decodeFilterValue(t.slice(3));
    else if (t.startsWith("tf:")) targetFilter = decodeFilterValue(t.slice(3));
    else if (t === "tz:l")        useLocalTime = true;
    // other tokens (cb, bc:, t:) are ignored — managed by EventsPanel
  }
  return {
    streams: streams ?? new Set(DEFAULT_ENABLED_STREAMS),
    abilityFilter,
    sourceFilter,
    targetFilter,
    useLocalTime,
  };
}

function buildAllActivityTokens(
  existing: string | null | undefined,
  streams: Set<StreamType>,
  abilityFilter: string,
  sourceFilter: string,
  targetFilter: string,
  useLocalTime: boolean = false,
): string | null {
  // Preserve tokens we don't own (cb, bc:, t:, etc.)
  const preserved = (existing ?? "").split(",").map((t) => t.trim())
    .filter((t) => t && !t.startsWith("s:") && !t.startsWith("af:")
                     && !t.startsWith("sf:") && !t.startsWith("tf:")
                     && !t.startsWith("tz:"));
  const streamCode = encodeStreams(streams);
  if (streamCode !== DEFAULT_STREAM_CODE) preserved.push(`s:${streamCode}`);
  if (abilityFilter.trim()) preserved.push(`af:${encodeFilterValue(abilityFilter.trim())}`);
  if (sourceFilter.trim())  preserved.push(`sf:${encodeFilterValue(sourceFilter.trim())}`);
  if (targetFilter.trim())  preserved.push(`tf:${encodeFilterValue(targetFilter.trim())}`);
  if (useLocalTime) preserved.push("tz:l");
  return preserved.length > 0 ? preserved.join(",") : null;
}



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

// Time formatting helpers
function formatTimestamp(absoluteMilli: number, useLocalTime: boolean = false): string {
  const eventTime = new Date(absoluteMilli);
  if (useLocalTime) {
    const ms = eventTime.getMilliseconds().toString().padStart(3, "0");
    return eventTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) + `.${ms}`;
  }
  // UTC format
  const hours = eventTime.getUTCHours().toString().padStart(2, "0");
  const minutes = eventTime.getUTCMinutes().toString().padStart(2, "0");
  const seconds = eventTime.getUTCSeconds().toString().padStart(2, "0");
  const ms = eventTime.getUTCMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function formatRelativeTime(offsetMilli: number): string {
  const sign = offsetMilli >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMilli);
  const totalSeconds = absOffset / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return `${sign}${minutes}:${seconds.padStart(4, "0")}`;
}

const GEAR_SLOT_NAMES = [
  "Head", "Neck", "Shoulder", "Shirt", "Chest", "Waist", "Legs", "Feet",
  "Wrist", "Hands", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2",
  "Back", "Main Hand", "Off Hand", "Ranged", "Tabard",
];

function trailerColor(labels: string[]): string {
  if (labels.some((label) => label.includes("Absorb"))) return "text-sky-400";
  if (labels.some((label) => label.includes("Block"))) return "text-amber-400";
  if (labels.some((label) => label.includes("Resist"))) return "text-violet-400";
  return "text-muted-foreground";
}

function trailerLabel(labels: string[]): string {
  return labels
    .map((label) => label.replace(/^Partial /, "").replace(/^Full /, ""))
    .join("+")
    .toLowerCase();
}

interface RawEventRowProps {
  event: RawDebugEvent;
  index: number;
  useRelativeTime?: boolean;
  useLocalTime?: boolean;
}

function RawEventRow({ event, index, useRelativeTime = false, useLocalTime = false }: RawEventRowProps) {
  const config = STREAM_CONFIG[event.streamType];
  const Icon = config.icon;
  
  // Format timestamp: relative offset or absolute time (UTC by default, local if toggled)
  const timeStr = useRelativeTime 
    ? formatRelativeTime(event.offsetMilli)
    : formatTimestamp(event.dateMilli, useLocalTime);
  
  // Determine amount color: use resource-specific color for resource_change, stream color otherwise
  const amountColor = event.resourceType 
    ? RESOURCE_COLORS[event.resourceType] 
    : config.color;
  
  const amountElement = (
    <span className={cn("w-12 text-right shrink-0", amountColor)}>{event.amount.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
  );
  
  const trailerElement = event.damageTrailers && event.damageTrailers.length > 0 ? (
    <span className="w-44 shrink-0 flex items-center gap-1 overflow-hidden">
      {event.damageTrailers.map((trailer, trailerIndex) => (
        <span
          key={`${trailer.hitType}-${trailerIndex}`}
          className={cn("text-[10px] font-medium whitespace-nowrap", trailerColor(trailer.labels))}
          title={`${trailer.amount.toLocaleString()} ${trailer.labels.join(", ")} (hit type ${trailer.hitType})`}
        >
          {trailer.amount.toLocaleString()} {trailerLabel(trailer.labels)}
        </span>
      ))}
    </span>
  ) : (
    <span className="w-44 shrink-0 text-muted-foreground/30">-</span>
  );

  // ActivityEvent column - shows debug annotations when present
  // Activity types indicated by color: start (green), bump (yellow), end (orange), slain (red+skull)
  // Shows entity names only, comma-separated if multiple
  const activityEventElement = event.activityEvents && event.activityEvents.length > 0 ? (
    <span className="w-36 shrink-0 text-[10px] truncate flex items-center gap-1">
      {event.activityEvents.map((activity, i) => (
        <span
          key={i}
          className={cn(
            "font-semibold",
            activity.type === "start" && "text-green-400",
            activity.type === "bump" && "text-yellow-400",
            activity.type === "end" && "text-orange-400",
            activity.type === "slain" && "text-red-500",
          )}
          title={`${activity.type}: ${activity.name} (${activity.guid})`}
        >
          {activity.type === "slain" && "💀"}{activity.name}{i < event.activityEvents!.length - 1 && ","}
        </span>
      ))}
    </span>
  ) : (
    <span className="w-36 shrink-0 text-muted-foreground/30">-</span>
  );
  
  const rowContent = (
    <div className="flex items-center gap-2 text-xs font-mono py-0.5 border-b border-border/30 hover:bg-muted/30">
      <span className="text-muted-foreground w-6 text-right shrink-0">{index}</span>
      <Icon className={cn("h-3 w-3 shrink-0", config.color)} />
      <span className="text-muted-foreground w-22 shrink-0">{timeStr}</span>
      <span className="text-orange-400 w-24 shrink-0 truncate" title={event.caster}>{event.casterName || "-"}</span>
      {event.spellId ? (
        <Link
          to={`/wowdb/spell/${event.spellId}`}
          className="text-blue-400 hover:text-blue-300 w-24 shrink-0 truncate"
          title={event.sourceName}
          onClick={(e) => e.stopPropagation()}
        >
          {event.sourceName}
        </Link>
      ) : (
        <span className="text-blue-400 w-24 shrink-0 truncate" title={event.sourceName}>
          {event.sourceName}
        </span>
      )}
      <span className="text-muted-foreground shrink-0">→</span>
      <span className={cn("w-24 shrink-0 truncate",
        event.affiliation === 1 ? "text-green-400" :
        event.affiliation === 2 ? "text-red-400" :
        event.affiliation === 3 ? "text-yellow-400" :
        "text-purple-400"
      )} title={event.target ?? undefined}>{event.targetName}</span>
      {event.extra ? (
        <Tooltip>
          <TooltipTrigger asChild>{amountElement}</TooltipTrigger>
          <TooltipContent side="top">{event.extra}</TooltipContent>
        </Tooltip>
      ) : (
        amountElement
      )}
      {trailerElement}
      {activityEventElement}
    </div>
  );

  if (event.gear && event.gear.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{rowContent}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="text-xs font-mono space-y-0.5">
            <div className="font-semibold text-sky-400 mb-1">{event.casterName} — Equipment</div>
            {event.gear.map((g, i) => (
              <div key={i} className={cn("flex justify-between gap-3", g.itemId === 0 && "text-muted-foreground/40")}>
                <span className="text-muted-foreground">{GEAR_SLOT_NAMES[i] ?? `Slot ${i}`}</span>
                <span>{g.itemId > 0 ? g.itemId : "—"}{g.enchantId ? ` (ench: ${g.enchantId})` : ""}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return rowContent;
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
        
        <span className="px-2 text-muted-foreground font-mono">
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
  abilityFilter: string;
  onAbilityFilterChange: (filter: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (filter: string) => void;
  targetFilter: string;
  onTargetFilterChange: (filter: string) => void;
  useRelativeTime?: boolean;
  useLocalTime?: boolean;
  onToggleLocalTime?: () => void;
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
  abilityFilter,
  onAbilityFilterChange,
  sourceFilter,
  onSourceFilterChange,
  targetFilter,
  onTargetFilterChange,
  useRelativeTime = false,
  useLocalTime = false,
  onToggleLocalTime,
}: AllActivityContentProps) {
  
  // Default state during loading
  const emptyByStream = { damage: [], heal: [], resource_change: [], extra_attack: [], slain: [], ressurection: [], cast: [], aura: [], spell_go: [], aura_cast: [], spell_start: [], spell_fail: [], unit_classification: [], combatant_info: [], dispel: [], interrupt: [], absorbed: [], companion_stats: [], consume: [] };
  const emptyEncounters = new Map<string, EncounterMeta>();
  const safeResult = result ?? {
    counts: new Map<string, number>(),
    rawEventsByStream: emptyByStream,
    streamCounts: { damage: 0, heal: 0, resource_change: 0, extra_attack: 0, slain: 0, ressurection: 0, cast: 0, aura: 0, spell_go: 0, aura_cast: 0, spell_start: 0, spell_fail: 0, unit_classification: 0, combatant_info: 0, dispel: 0, interrupt: 0, absorbed: 0, companion_stats: 0, consume: 0 },
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
    ...rawEventsByStream.ressurection,
    ...rawEventsByStream.slain,
    ...rawEventsByStream.spell_go,
    ...rawEventsByStream.aura_cast,
    ...rawEventsByStream.extra_attack,
    ...rawEventsByStream.unit_classification,
    ...rawEventsByStream.combatant_info,
    ...rawEventsByStream.dispel,
    ...rawEventsByStream.consume,
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
    <div className="h-full min-h-0 flex flex-col">
      {/* Stream toggles and ability filter */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Streams:</span>
        {([
          "damage", "heal", "resource_change", "extra_attack", "slain", "ressurection",
          "aura", "aura_cast",
          "spell_start", "spell_go", "spell_fail", "consume",
          "unit_classification", "combatant_info", "dispel"
        ] as StreamType[]).map((stream) => (
          <StreamToggle
            key={stream}
            streamType={stream}
            enabled={enabledStreams.has(stream)}
            count={safeResult.streamCounts[stream]}
            onToggle={() => onToggleStream(stream)}
          />
        ))}
        
        {/* Source filter input */}
        <div className="flex items-center gap-1 ml-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="relative">
            <input
              type="text"
              value={sourceFilter}
              onChange={(e) => onSourceFilterChange(e.target.value)}
              placeholder="Filter by source..."
              className="h-6 w-32 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {sourceFilter && (
              <button
                type="button"
                onClick={() => onSourceFilterChange("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted-foreground/20 rounded"
                title="Clear filter"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        
        {/* Ability filter input */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <input
              type="text"
              value={abilityFilter}
              onChange={(e) => onAbilityFilterChange(e.target.value)}
              placeholder="Filter by ability..."
              className="h-6 w-32 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {abilityFilter && (
              <button
                type="button"
                onClick={() => onAbilityFilterChange("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted-foreground/20 rounded"
                title="Clear filter"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        
        {/* Target filter input */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <input
              type="text"
              value={targetFilter}
              onChange={(e) => onTargetFilterChange(e.target.value)}
              placeholder="Filter by target..."
              className="h-6 w-32 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {targetFilter && (
              <button
                type="button"
                onClick={() => onTargetFilterChange("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted-foreground/20 rounded"
                title="Clear filter"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Stats row with pagination */}
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground mb-2 flex-wrap">
        <div className="flex items-center gap-4">
          <span>
            Total Processed: <span className="font-medium text-foreground">{formatNumber(totalEvents)}</span>
          </span>
          {processingTimeMs !== null && (
            <span data-chromatic="ignore" className="text-blue-500">
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
      <ScrollArea className="flex-1 min-h-0 border rounded">
        <div className="p-1 min-w-max">
          {/* Header */}
          <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground py-1 border-b sticky top-0 bg-background">
            <span className="w-6 text-right shrink-0">#</span>
            <span className="w-3 shrink-0"></span>
            <button
              type="button"
              onClick={() => onToggleLocalTime?.()}
              className="w-24 shrink-0 text-left hover:text-foreground transition-colors cursor-pointer"
              title={useLocalTime ? "Click to show UTC time" : "Click to show local time"}
            >
              Time {useRelativeTime ? "" : useLocalTime ? "(local)" : "(UTC)"}
            </button>
            <span className="w-24 shrink-0">Caster</span>
            <span className="w-24 shrink-0">Ability</span>
            <span className="shrink-0"></span>
            <span className="w-24 shrink-0">Target</span>
            <span className="w-12 text-right shrink-0">Amount</span>
            <span className="w-44 shrink-0">Trailers</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-36 shrink-0 cursor-help">Activity <span className="text-muted-foreground">ⓘ</span></span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="space-y-1">
                  <div><span className="text-green-400 font-semibold">■</span> start - period began</div>
                  <div><span className="text-yellow-400 font-semibold">■</span> bump - timer extended</div>
                  <div><span className="text-orange-400 font-semibold">■</span> end - period ended</div>
                  <div><span className="text-red-500 font-semibold">■</span> 💀 slain - unit died</div>
                </div>
              </TooltipContent>
            </Tooltip>
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
                    <RawEventRow event={event} index={globalOffset + idx} useRelativeTime={useRelativeTime} useLocalTime={useLocalTime} />
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
  panelIndex?: number;
  useRelativeTime?: boolean;
  panelOption?: string | null;
  setPanelOption?: (option: string | null) => void;
  panelContext?: Record<string, unknown> | null;
}

function AllActivityWrapper({ context, panelIndex, useRelativeTime = false, panelOption, setPanelOption, panelContext: panelContextData }: AllActivityWrapperProps) {
  // Parse initial state from saved panelOption (mount-only)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => parseAllActivityTokens(panelOption), []);

  const [currentPage, setCurrentPage] = useState(1);
  const [enabledStreams, setEnabledStreams] = useState<Set<StreamType>>(initial.streams);
  const [abilityFilter, setAbilityFilter] = useState(initial.abilityFilter);
  const [sourceFilter, setSourceFilter] = useState(initial.sourceFilter);
  const [targetFilter, setTargetFilter] = useState(initial.targetFilter);
  const [useLocalTime, setUseLocalTime] = useState(initial.useLocalTime);

  // Sync state changes back to panelOption for persistence in shared layouts/links.
  // Uses a ref for panelOption to avoid feedback loops (state change → setPanelOption →
  // parent re-render → new panelOption → effect re-fires).
  const panelOptionRef = useRef(panelOption);
  panelOptionRef.current = panelOption;
  const setPanelOptionRef = useRef(setPanelOption);
  setPanelOptionRef.current = setPanelOption;
  const syncRef = useRef(false); // skip initial mount sync
  useEffect(() => {
    if (!syncRef.current) { syncRef.current = true; return; }
    const timer = setTimeout(() => {
      setPanelOptionRef.current?.(buildAllActivityTokens(
        panelOptionRef.current, enabledStreams, abilityFilter, sourceFilter, targetFilter, useLocalTime,
      ));
    }, 300);
    return () => clearTimeout(timer);
  }, [enabledStreams, abilityFilter, sourceFilter, targetFilter, useLocalTime]);
  
  // Track previous encounter key to reset page when encounters change
  // Using the React-approved pattern for "adjusting state when a prop changes"
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const encounterKey = context.selectedEncounterIds.join(",");
  const [prevEncounterKey, setPrevEncounterKey] = useState(encounterKey);
  if (prevEncounterKey !== encounterKey) {
    setPrevEncounterKey(encounterKey);
    setCurrentPage(1);
  }
  
  // Create context with pagination, enabled streams, and ability filter
  const paginatedContext = useMemo((): PanelContext => ({
    ...context,
    pagination: {
      offset: (currentPage - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      enabledStreams: Array.from(enabledStreams),
      abilityFilter: abilityFilter.trim() || undefined,
      sourceFilter: sourceFilter.trim() || undefined,
      targetFilter: targetFilter.trim() || undefined,
    },
  }), [context, currentPage, enabledStreams, abilityFilter, sourceFilter, targetFilter]);
  
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
    panelIndex,
    panelContext: panelContextData,
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
  
  const handleAbilityFilterChange = useCallback((filter: string) => {
    setAbilityFilter(filter);
    // Reset to page 1 when filter changes
    setCurrentPage(1);
  }, []);
  
  const handleSourceFilterChange = useCallback((filter: string) => {
    setSourceFilter(filter);
    // Reset to page 1 when filter changes
    setCurrentPage(1);
  }, []);
  
  const handleTargetFilterChange = useCallback((filter: string) => {
    setTargetFilter(filter);
    // Reset to page 1 when filter changes
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
      abilityFilter={abilityFilter}
      onAbilityFilterChange={handleAbilityFilterChange}
      sourceFilter={sourceFilter}
      onSourceFilterChange={handleSourceFilterChange}
      targetFilter={targetFilter}
      onTargetFilterChange={handleTargetFilterChange}
      useRelativeTime={useRelativeTime}
      useLocalTime={useLocalTime}
      onToggleLocalTime={() => setUseLocalTime((prev) => !prev)}
    />
  );
}

/**
 * Legacy render function that simply extracts context and delegates to wrapper.
 * This maintains compatibility with the PanelDefinition interface.
 */
function AllActivityRender(props: PanelRenderProps<AllActivityState>) {
  // The wrapper manages its own aggregation with pagination
  return (
    <AllActivityWrapper
      context={props.context}
      panelIndex={props.panelIndex}
      useRelativeTime={props.checkboxChecked}
      panelOption={props.panelOption}
      setPanelOption={props.setPanelOption}
      panelContext={props.panelContext}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AllActivityPanel: PanelDefinition<AllActivityState, any> = {
  ...allActivityProcessor,
  label: "All Activity",
  icon: <Skull className="h-4 w-4" />,
  // This panel manages its own aggregation to support pagination
  selfManagesAggregation: true,
  checkboxLabel: "Encounter offset",
  supportsFiltering: true,
  defaultFilters: [{ type: "time_range" as const, value: "controller" }],
  
  render: (props: PanelRenderProps<AllActivityState>) => (
    <AllActivityRender {...props} />
  ),
};
