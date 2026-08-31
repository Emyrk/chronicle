/**
 * All Activity Debug panel - Shows raw events with stream type toggles
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Skull, Swords, Heart, Zap, Wand2, Sparkles, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X, Crosshair, Play, CircleX, Bubbles, WandSparkles, CircleFadingPlus, UserCheck, Ban, Shield, HeartPulse, FlaskConical, Download, LoaderCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { ScrollArea, ScrollBar } from "@/components/ui/ScrollArea/ScrollArea";
import { SCHOOL_TEXT_COLORS } from "@/components/SpellSchoolBadge";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import type { PanelDefinition, PanelRenderProps, PanelContext } from "./types";
import { allActivityProcessor, type AllActivityState, type RawDebugEvent, type EncounterMeta, type ResourceType } from "./processors";
import { ALL_ACTIVITY_STREAMS, STREAM_TYPE_CODES, collectAllActivityEvents, eventDetail, eventValue } from "./allActivityEvents";
import { appendAllActivityCsvPage, createAllActivityCsv, downloadAllActivityCsv, sortAllActivityEvents, type AllActivityCsvExportState, type AllActivityCsvOptions } from "./allActivityCsv";
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
const STREAM_CONFIG: Record<StreamType, { icon: React.ElementType; color: string; label: string; description: string }> = {
  damage: { icon: Swords, color: "text-red-500", label: "Damage", description: "Damage dealt, including hit outcomes, schools, and mitigation." },
  heal: { icon: Heart, color: "text-green-500", label: "Healing", description: "Healing received, including critical heals and overhealing." },
  resource_change: { icon: Zap, color: "text-yellow-500", label: "Resource", description: "Health, mana, rage, energy, and other resource gains or losses." },
  extra_attack: { icon: CircleFadingPlus, color: "text-orange-500", label: "Extra Attack", description: "Additional attacks granted by effects such as Windfury." },
  ressurection: { icon: HeartPulse, color: "text-emerald-400", label: "Resurrection", description: "Players or units restored to life by a resurrection spell." },
  slain: { icon: Skull, color: "text-pink-400", label: "Slain", description: "Unit deaths and the final-damage attribution when available." },
  aura: { icon: Sparkles, color: "text-cyan-500", label: "Aura", description: "Buff and debuff applications, removals, and stack changes." },
  spell_go: { icon: Crosshair, color: "text-amber-500", label: "Spell Go", description: "Finish of a Spell Start, including target hit and miss counts." },
  aura_cast: { icon: WandSparkles, color: "text-teal-500", label: "Aura Cast", description: "Mirrors Auras, with duration and periodic tick timing." },
  spell_start: { icon: Play, color: "text-lime-500", label: "Spell Start", description: "The beginning of a spell cast or channel." },
  spell_fail: { icon: CircleX, color: "text-red-400", label: "Spell Fail", description: "Spell casts that failed or were rejected by the server." },
  unit_classification: { icon: Search, color: "text-indigo-500", label: "Classification", description: "Unit type, affiliation, ownership, and possession changes." },
  combatant_info: { icon: UserCheck, color: "text-sky-400", label: "Combatant Info", description: "Player identity, talents, equipment, guild, and character metadata." },
  dispel: { icon: Bubbles, color: "text-violet-400", label: "Dispel", description: "Auras removed by dispels and the dispel type used." },
  interrupt: { icon: Ban, color: "text-rose-400", label: "Interrupt", description: "Spell casts stopped by an interrupting ability." },
  absorbed: { icon: Shield, color: "text-sky-400", label: "Absorbed", description: "Damage prevented by shields and other absorb effects." },
  companion_stats: { icon: Shield, color: "text-teal-400", label: "Companion Stats", description: "Stat snapshots reported for pets and other companions." },
  consume: { icon: FlaskConical, color: "text-fuchsia-400", label: "Consume", description: "Consumable use inferred from items, spells, auras, or combat effects." },
  raid_group: { icon: Users, color: "text-blue-300", label: "Raid Group", description: "Eight-group raid composition snapshots reported by the companion." },

  cast: { icon: Wand2, color: "text-purple-500", label: "Cast", description: "General spell cast actions and their selected targets." },
};
// --- Panel option encode/decode helpers for state persistence ---

const DEFAULT_ENABLED_STREAMS = new Set<StreamType>(["damage", "heal", "slain", "ressurection"]);

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
  raid_group: "y",
};
const CODE_TO_STREAM = Object.fromEntries(
  Object.entries(STREAM_CODES).map(([k, v]) => [v, k as StreamType]),
) as Record<string, StreamType>;
const DEFAULT_STREAM_CODE = "dhxz"; // sorted code for DEFAULT_ENABLED_STREAMS

function encodeStreams(streams: Set<StreamType>): string {
  return [...streams].map((s) => STREAM_CODES[s]).sort().join("");
}
function decodeStreams(code: string): Set<StreamType> {
  const set = new Set<StreamType>();
  for (const ch of code) {
    const s = CODE_TO_STREAM[ch];
    if (s && ALL_ACTIVITY_STREAMS.includes(s)) set.add(s);
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
  const formattedCount = formatNumber(count);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${enabled ? "Disable" : "Enable"} ${config.label} stream (${formattedCount} events)`}
          className={cn(
            "group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ring-1 ring-transparent transition-all hover:bg-muted/80 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
            enabled
              ? `${config.color} bg-muted`
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
          <span className={cn("font-mono", !enabled && "line-through")}>{formattedCount}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className="max-w-64 border border-border bg-popover px-3 py-2.5 text-left text-popover-foreground shadow-xl"
        hideArrow
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4 shrink-0", config.color)} />
          <span className="font-semibold">{config.label}</span>
          <span className="ml-auto font-mono text-muted-foreground">{formattedCount}</span>
        </div>
        <p className="mt-1.5 leading-relaxed text-muted-foreground">{config.description}</p>
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Click to {enabled ? "hide" : "show"} this stream
        </p>
      </TooltipContent>
    </Tooltip>
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
  // Round to tenths of a second first, then split into minutes:seconds
  // to avoid .toFixed(1) rounding 59.96… up to "60.0".
  const totalTenths = Math.round(absOffset / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = (totalTenths % 600) / 10;
  return `${sign}${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

const GEAR_SLOT_NAMES = [
  "Head", "Neck", "Shoulder", "Shirt", "Chest", "Waist", "Legs", "Feet",
  "Wrist", "Hands", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2",
  "Back", "Main Hand", "Off Hand", "Ranged", "Tabard",
];

const EVENT_ROW_COLUMNS = "30px 68px 108px 128px 152px 140px 64px minmax(170px, 1fr) 132px 116px";

const CLASS_TEXT_COLORS: Record<string, string> = {
  WARRIOR: "text-class-warrior",
  PRIEST: "text-class-priest",
  ROGUE: "text-class-rogue",
  MAGE: "text-class-mage",
  DRUID: "text-class-druid",
  HUNTER: "text-class-hunter",
  WARLOCK: "text-class-warlock",
  PALADIN: "text-class-paladin",
  SHAMAN: "text-class-shaman",
  DEATHKNIGHT: "text-class-deathknight",
};

function entityTextColor(className?: string, isEnemy?: boolean, fallback = "text-muted-foreground"): string {
  if (className) return CLASS_TEXT_COLORS[className.toUpperCase()] ?? fallback;
  if (isEnemy) return "text-red-400";
  return fallback;
}

const FLAG_STYLES: Record<string, string> = {
  HEALTH: "border-green-400/25 bg-green-400/10 text-green-300",
  MANA: "border-blue-400/25 bg-blue-400/10 text-blue-300",
  RAGE: "border-red-400/25 bg-red-400/10 text-red-300",
  ENERGY: "border-yellow-400/25 bg-yellow-400/10 text-yellow-300",
  FOCUS: "border-orange-400/25 bg-orange-400/10 text-orange-300",
  HAPPINESS: "border-pink-400/25 bg-pink-400/10 text-pink-300",
  SYNTHETIC: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  ESTIMATED: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  OVERKILL: "border-red-400/25 bg-red-400/10 text-red-300",
  OVERHEAL: "border-green-400/25 bg-green-400/10 text-green-300",
  ABSORB: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  CRIT: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  GLANCING: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  CRUSHING: "border-orange-400/25 bg-orange-400/10 text-orange-300",
  MISS: "border-zinc-400/25 bg-zinc-400/10 text-zinc-300",
  IMMUNE: "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300",
  "FULL RESIST": "border-violet-400/25 bg-violet-400/10 text-violet-300",
  SERVER: "border-red-400/25 bg-red-400/10 text-red-300",
  ITEM: "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300",
  PROJECTED: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  POSSESSED: "border-purple-400/25 bg-purple-400/10 text-purple-300",
  AMBIGUOUS: "border-orange-400/25 bg-orange-400/10 text-orange-300",
  "NO ATTRIB": "border-orange-400/25 bg-orange-400/10 text-orange-300",
};

const ACTIVITY_STYLES: Record<string, string> = {
  start: "border-green-400/25 bg-green-400/10 text-green-300",
  bump: "border-yellow-400/25 bg-yellow-400/10 text-yellow-300",
  end: "border-orange-400/25 bg-orange-400/10 text-orange-300",
  slain: "border-red-400/25 bg-red-400/10 text-red-300",
};

function EventDetailText({ detail }: { detail: string }) {
  return detail.split(" · ").map((part, index) => {
    const normalized = part.toLowerCase();
    const schoolStyle = SCHOOL_TEXT_COLORS[part];
    const resourceType = Object.keys(RESOURCE_COLORS).find((type) => type.toLowerCase() === normalized) as ResourceType | undefined;
    const style = (resourceType ? RESOURCE_COLORS[resourceType] : schoolStyle)
      ?? (normalized.includes("absorb")
        ? "text-sky-400"
        : normalized.includes("block")
          ? "text-amber-400"
          : normalized.includes("resist")
            ? "text-violet-400"
            : normalized.includes("immune")
              ? "text-fuchsia-400"
              : normalized.includes("crit")
                ? "font-bold text-foreground"
                : "text-muted-foreground");

    return (
      <span key={`${part}-${index}`}>
        {index > 0 && <span className="text-muted-foreground/60"> · </span>}
        <span className={style}>{part}</span>
      </span>
    );
  });
}

interface RawEventRowProps {
  event: RawDebugEvent;
  index: number;
  useRelativeTime?: boolean;
  useLocalTime?: boolean;
}

function RawEventRow({ event, index, useRelativeTime = false, useLocalTime = false }: RawEventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const config = STREAM_CONFIG[event.streamType];
  const Icon = config.icon;
  const timeStr = useRelativeTime
    ? formatRelativeTime(event.offsetMilli)
    : formatTimestamp(event.dateMilli, useLocalTime);
  const amountColor = event.resourceType ? RESOURCE_COLORS[event.resourceType] : config.color;
  const details = [
    { label: "Stream", value: event.streamType },
    { label: "Encounter", value: event.encounterID },
    { label: "Event index", value: String(event.index) },
    { label: "Offset", value: `${event.offsetMilli.toLocaleString()} ms` },
    { label: "Source GUID", value: event.caster || "—" },
    { label: "Target GUID", value: event.target || "—" },
    { label: "Spell ID", value: event.spellId ? String(event.spellId) : "—" },
    { label: "Detail", value: eventDetail(event) },
    ...(event.details ?? []),
  ];

  return (
    <TooltipProvider disableHoverableContent={false}>
      <Tooltip open={expanded}>
        <div className={cn("group", event.isSynthetic && "border-l-2 border-l-violet-400")}>
          <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                setExpanded(true);
              } else if (keyboardEvent.key === "Escape") {
                setExpanded(false);
              }
            }}
        className={cn(
          "grid min-h-5 items-center border-b border-border/25 font-mono text-[10px] leading-3 outline-none transition-colors",
          index % 2 === 0 ? "bg-background/30" : "bg-muted/[0.12]",
          "hover:bg-muted/40 focus-visible:bg-muted/45 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/70",
          expanded && "bg-muted/35",
        )}
        style={{ gridTemplateColumns: EVENT_ROW_COLUMNS }}
      >
        <span className="pr-1 text-right text-muted-foreground/70">{index}</span>
        <span className="flex min-w-0 items-center gap-1 px-1" title={config.label}>
          <Icon className={cn("h-3 w-3 shrink-0", config.color)} />
          <span className={cn("truncate text-[9px] font-bold tracking-[0.06em]", config.color)}>
            {STREAM_TYPE_CODES[event.streamType]}
          </span>
        </span>
        <span className="truncate px-1.5 text-foreground/80">{timeStr}</span>
        <span
          className={cn("truncate px-1.5", entityTextColor(event.sourceClass, event.sourceIsEnemy, "text-orange-300"))}
          title={event.caster || undefined}
        >
          {event.casterName || "—"}
        </span>
        <span className="min-w-0 truncate px-1.5">
          {event.spellId ? (
            <Link
              to={`/wowdb/spell/${event.spellId}`}
              className="text-blue-400 hover:text-blue-300"
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              <SpellIdTooltip
                spellId={event.spellId}
                name={event.sourceName || "—"}
                size={14}
                loadOnHover
              />
            </Link>
          ) : (
            <span className="text-blue-400" title={event.sourceName}>{event.sourceName || "—"}</span>
          )}
        </span>
        <span
          className={cn(
            "flex min-w-0 items-center gap-1 px-1.5",
            entityTextColor(
              event.targetClass,
              event.targetIsEnemy || event.affiliation === 2,
              event.affiliation === 1 ? "text-green-400" : event.affiliation === 3 ? "text-yellow-400" : "text-purple-300",
            ),
          )}
          title={event.target ?? undefined}
        >
          {event.targetName ? (
            <>
              <span className="shrink-0 font-bold text-foreground/70">→</span>
              <span className="truncate">{event.targetName}</span>
            </>
          ) : "—"}
        </span>
        <span className={cn("px-1.5 text-right font-semibold tabular-nums", amountColor)}>
          {eventValue(event)}
        </span>
        <span className="truncate whitespace-nowrap px-1.5" title={eventDetail(event)}>
          <EventDetailText detail={eventDetail(event)} />
        </span>
        <span className="flex min-w-0 gap-1 overflow-hidden px-1.5">
          {event.flags?.length ? event.flags.map((flag) => (
            <span
              key={flag}
              className={cn(
                "shrink-0 rounded-sm border px-1 py-px text-[8px] font-bold leading-none tracking-[0.04em]",
                FLAG_STYLES[flag] ?? "border-border bg-muted text-muted-foreground",
              )}
            >
              {flag}
            </span>
          )) : <span className="text-muted-foreground/30">—</span>}
        </span>
        <span className="flex min-w-0 gap-1 overflow-hidden px-1.5">
          {event.activityEvents?.length ? event.activityEvents.map((activity, activityIndex) => (
            <span
              key={`${activity.guid}-${activity.type}-${activityIndex}`}
              title={`${activity.type}: ${activity.name} (${activity.guid})`}
              className={cn(
                "shrink-0 rounded-sm border px-1 py-px text-[8px] font-bold leading-none tracking-[0.04em]",
                ACTIVITY_STYLES[activity.type],
              )}
            >
              {activity.type}
            </span>
          )) : <span className="text-muted-foreground/30">—</span>}
        </span>
          </div>
          </TooltipTrigger>

          <TooltipContent
            side="bottom"
            align="start"
            sideOffset={2}
            collisionPadding={12}
            onPointerLeave={() => setExpanded(false)}
            className="styled-scrollbar relative z-50 max-h-[70vh] w-[560px] max-w-[calc(100vw-2rem)] overflow-auto rounded-md border-2 border-primary/60 bg-card px-4 py-3 text-left text-card-foreground shadow-[0_12px_36px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.08)] ring-1 ring-black/80 outline-none"
            hideArrow
          >
          <button
            type="button"
            aria-label="Close event details"
            title="Close"
            onClick={() => setExpanded(false)}
            className="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mb-3 pr-7">
            <div className={cn("mb-1.5 font-mono text-[10px] font-bold tracking-[0.08em]", config.color)}>
              {config.label.toUpperCase()}
            </div>
            <p className="text-xs text-foreground">
              <span className={cn("font-medium", entityTextColor(event.sourceClass, event.sourceIsEnemy, "text-orange-300"))}>
                {event.casterName || "Unknown source"}
              </span>
              <span className="text-muted-foreground"> → </span>
              <span className="font-medium text-blue-400">{event.sourceName || config.label}</span>
              {event.targetName && <><span className="text-muted-foreground"> → </span><span className={cn("font-medium", entityTextColor(event.targetClass, event.targetIsEnemy, "text-purple-300"))}>{event.targetName}</span></>}
              <span className="text-muted-foreground"> · </span>
              <EventDetailText detail={eventDetail(event)} />
            </p>
          </div>

          <div className="grid max-w-4xl grid-cols-[132px_minmax(0,1fr)] gap-x-4 font-mono text-[10px] leading-5">
            {details.map((detail) => (
              <div key={`${detail.label}-${detail.value}`} className="contents">
                <span className="truncate text-muted-foreground">{detail.label}</span>
                <span className="break-all text-foreground/85">{detail.value}</span>
              </div>
            ))}
          </div>

          {event.raidGroups ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {event.raidGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="rounded border border-blue-300/20 bg-blue-300/5 px-2 py-1.5">
                  <div className="mb-1 font-mono text-[9px] font-semibold tracking-[0.08em] text-blue-300">GROUP {groupIndex + 1}</div>
                  {group.length ? group.map((member) => (
                    <div key={member.guid} className="flex min-w-0 justify-between gap-2 font-mono text-[10px] leading-5">
                      <span className={cn("truncate", member.className ? `class-${member.className.toLowerCase()}` : "text-foreground/85")}>{member.name}</span>
                      <span className="truncate text-muted-foreground" title={member.guid}>{member.guid}</span>
                    </div>
                  )) : <div className="font-mono text-[10px] text-muted-foreground/50">Empty</div>}
                </div>
              ))}
            </div>
          ) : null}

          {event.activityEvents?.length ? (
            <div className="mt-3 max-w-4xl rounded border border-teal-400/20 bg-teal-400/5 px-3 py-2">
              <div className="mb-1 font-mono text-[9px] font-semibold tracking-[0.08em] text-teal-300">
                ACTIVITY · {event.activityEvents.length}
              </div>
              {event.activityEvents.map((activity, activityIndex) => (
                <div key={`${activity.guid}-${activityIndex}`} className="grid grid-cols-[52px_150px_minmax(0,1fr)] font-mono text-[10px] leading-5">
                  <span className={cn("font-semibold", ACTIVITY_STYLES[activity.type]?.split(" ").find((value) => value.startsWith("text-")))}>{activity.type}</span>
                  <span className="truncate text-foreground/85">{activity.name}</span>
                  <span className="truncate text-muted-foreground">{activity.guid}</span>
                </div>
              ))}
            </div>
          ) : null}

          {event.gear?.length ? (
            <details className="mt-3 max-w-4xl">
              <summary className="cursor-pointer font-mono text-[10px] text-sky-300">Equipment · {event.gear.length} slots</summary>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[10px]">
                {event.gear.map((gear, gearIndex) => (
                  <div key={`${gear.itemId}-${gearIndex}`} className="flex justify-between gap-3 border-b border-border/30 py-0.5">
                    <span className="text-muted-foreground">{GEAR_SLOT_NAMES[gearIndex] ?? `Slot ${gearIndex}`}</span>
                    <span className={cn(gear.itemId === 0 && "text-muted-foreground/40")}>
                      {gear.itemId || "—"}{gear.enchantId ? ` · enchant ${gear.enchantId}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          </TooltipContent>
        </div>
      </Tooltip>
    </TooltipProvider>
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
  onExportCsv: () => void;
  exportPage: number | null;
  exportTotalPages: number;
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
  onExportCsv,
  exportPage,
  exportTotalPages,
}: AllActivityContentProps) {
  
  // Default state during loading
  const emptyByStream = { damage: [], heal: [], resource_change: [], extra_attack: [], slain: [], ressurection: [], cast: [], aura: [], spell_go: [], aura_cast: [], spell_start: [], spell_fail: [], unit_classification: [], combatant_info: [], dispel: [], interrupt: [], absorbed: [], companion_stats: [], consume: [], raid_group: [] };
  const emptyEncounters = new Map<string, EncounterMeta>();
  const safeResult = result ?? {
    counts: new Map<string, number>(),
    rawEventsByStream: emptyByStream,
    streamCounts: { damage: 0, heal: 0, resource_change: 0, extra_attack: 0, slain: 0, ressurection: 0, cast: 0, aura: 0, spell_go: 0, aura_cast: 0, spell_start: 0, spell_fail: 0, unit_classification: 0, combatant_info: 0, dispel: 0, interrupt: 0, absorbed: 0, companion_stats: 0, consume: 0, raid_group: 0 },
    encounters: emptyEncounters,
    totalProcessed: 0,
    eventsSkipped: 0,
    eventsCaptured: 0,
    pageOffset: 0,
  };
  
  // Get encounters map (handle both Map and deserialized object)
  const encounters: Map<string, EncounterMeta> = safeResult.encounters instanceof Map 
    ? safeResult.encounters 
    : new Map<string, EncounterMeta>();
  
  // Merge all captured events (processor already filtered by enabled streams)
  const rawEventsByStream = safeResult.rawEventsByStream ?? emptyByStream;
  const allCapturedEvents = collectAllActivityEvents(rawEventsByStream);
  
  // Sort by encounter first, then by index within encounter to reconstruct true event order
  const sortedEvents = sortAllActivityEvents(allCapturedEvents);
  
  // Calculate pagination info from the result
  const totalProcessed = safeResult.totalProcessed;
  const totalPages = Math.ceil(totalProcessed / PAGE_SIZE);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Stream toggles and ability filter */}
      <div className="flex items-center gap-2 mb-2 flex-wrap" data-lesson-target="streams">
        <span className="text-xs text-muted-foreground">Streams:</span>
        <TooltipProvider delayDuration={200} skipDelayDuration={100}>
          {ALL_ACTIVITY_STREAMS.map((stream) => (
            <StreamToggle
              key={stream}
              streamType={stream}
              enabled={enabledStreams.has(stream)}
              count={safeResult.streamCounts[stream]}
              onToggle={() => onToggleStream(stream)}
            />
          ))}
        </TooltipProvider>
        
        {/* Source filter input */}
        <div className="flex items-center gap-1 ml-2" data-lesson-target="quick-filters">
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
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={totalProcessed === 0 || loading || processing || exportPage !== null}
            className={cn(
              "flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted",
              (totalProcessed === 0 || loading || processing || exportPage !== null) && "cursor-not-allowed opacity-50",
            )}
            title="Export all filtered activity pages to CSV"
          >
            {exportPage !== null ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exportPage !== null
              ? `Exporting ${exportPage} / ${exportTotalPages}`
              : "Export CSV"}
          </button>
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalEvents={totalProcessed}
            onPageChange={onPageChange}
            loading={loading || processing}
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-destructive mb-2">Error: {error.message}</div>
      )}
      
      {/* Raw events list */}
      <ScrollArea className="flex-1 min-h-0 border rounded">
        <div className="min-w-[1080px] p-1">
          {/* Header */}
          <div
            className="sticky top-0 z-10 grid items-center border-b border-border bg-background py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            style={{ gridTemplateColumns: EVENT_ROW_COLUMNS }}
          >
            <span className="pr-1 text-right">#</span>
            <span className="px-1">Type</span>
            <button
              type="button"
              onClick={() => onToggleLocalTime?.()}
              className="cursor-pointer px-1.5 text-left transition-colors hover:text-foreground"
              data-lesson-target="time-formats"
              title={useLocalTime ? "Click to show UTC time" : "Click to show local time"}
            >
              Time {useRelativeTime ? "" : useLocalTime ? "(local)" : "(UTC)"}
            </button>
            <span className="px-1.5">Source</span>
            <span className="px-1.5">Action / Ability</span>
            <span className="px-1.5">Target</span>
            <span className="px-1.5 text-right">Value</span>
            <span className="px-1.5">Outcome / Detail</span>
            <span className="px-1.5">Flags</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help px-1.5">Activity ⓘ</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="space-y-1">
                  <div><span className="font-semibold text-green-400">■</span> start, period began</div>
                  <div><span className="font-semibold text-yellow-400">■</span> bump, timer extended</div>
                  <div><span className="font-semibold text-orange-400">■</span> end, period ended</div>
                  <div><span className="font-semibold text-red-500">■</span> slain, unit died</div>
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
                      <div className="flex items-center gap-2 border-y border-cyan-400/20 bg-cyan-400/5 py-0.5 text-[9px] font-semibold text-cyan-400">
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
interface AllActivityCsvExportConfig extends AllActivityCsvOptions {
  enabledStreams: StreamType[];
  abilityFilter?: string;
  sourceFilter?: string;
  targetFilter?: string;
}

interface ActiveAllActivityCsvExport extends AllActivityCsvExportState {
  config: AllActivityCsvExportConfig;
}

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

  const [csvExport, setCsvExport] = useState<ActiveAllActivityCsvExport | null>(null);
  const [csvExportError, setCsvExportError] = useState<Error | null>(null);

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
  
  const csvExportConfig = csvExport?.config;
  const csvExportContext = useMemo((): PanelContext => ({
    ...context,
    pagination: {
      offset: ((csvExport?.page ?? 1) - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      enabledStreams: csvExportConfig?.enabledStreams ?? [],
      abilityFilter: csvExportConfig?.abilityFilter,
      sourceFilter: csvExportConfig?.sourceFilter,
      targetFilter: csvExportConfig?.targetFilter,
    },
  }), [context, csvExport?.page, csvExportConfig]);

  const csvAggregation = usePanelAggregation({
    panel: allActivityProcessor as PanelDefinition<AllActivityState>,
    context: csvExportContext,
    panelContext: panelContextData,
    panelContextKey: csvExport ? `csv-export-${csvExport.page}` : "csv-export-idle",
    enabled: csvExport !== null,
  });

  const handleExportCsv = useCallback(() => {
    const totalPages = Math.ceil(result.totalProcessed / PAGE_SIZE);
    if (totalPages === 0) return;

    setCsvExportError(null);
    setCsvExport({
      page: 1,
      totalPages,
      events: [],
      config: {
        enabledStreams: Array.from(enabledStreams),
        abilityFilter: abilityFilter.trim() || undefined,
        sourceFilter: sourceFilter.trim() || undefined,
        targetFilter: targetFilter.trim() || undefined,
        useRelativeTime,
        useLocalTime,
      },
    });
  }, [result.totalProcessed, enabledStreams, abilityFilter, sourceFilter, targetFilter, useRelativeTime, useLocalTime]);

  useEffect(() => {
    if (!csvExport) return;
    if (csvAggregation.error) {
      setCsvExportError(csvAggregation.error);
      setCsvExport(null);
      return;
    }

    const expectedOffset = (csvExport.page - 1) * PAGE_SIZE;
    if (
      csvAggregation.loading
      || csvAggregation.processing
      || csvAggregation.processingTimeMs === null
      || csvAggregation.result.pageOffset !== expectedOffset
    ) {
      return;
    }

    const pageEvents = collectAllActivityEvents(csvAggregation.result.rawEventsByStream);
    const nextExport = appendAllActivityCsvPage(csvExport, pageEvents);
    if (csvExport.page >= csvExport.totalPages) {
      downloadAllActivityCsv(
        createAllActivityCsv(nextExport.events, csvExport.config),
        context.instance.id,
      );
      setCsvExport(null);
      return;
    }

    setCsvExport(nextExport);
  }, [csvExport, csvAggregation.loading, csvAggregation.processing, csvAggregation.processingTimeMs, csvAggregation.error, csvAggregation.result, context.instance.id]);

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
      error={error ?? csvExportError}
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
      onExportCsv={handleExportCsv}
      exportPage={csvExport?.page ?? null}
      exportTotalPages={csvExport?.totalPages ?? 0}
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
