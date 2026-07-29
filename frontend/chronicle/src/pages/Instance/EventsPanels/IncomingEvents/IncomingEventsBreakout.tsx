import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, ChevronUp, HeartPulse, Shield, Swords, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { RelativeHealthBar } from "@/components/ui/RelativeHealthBar/RelativeHealthBar";
import { calculateRelativeHealth } from "@/components/ui/RelativeHealthBar/relativeHealth";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import {
  relativeEventTime,
  relativeHealthMessagesAtCursor,
  syncCursorForDeath,
  timeAtTimelineY,
  timelineYForTime,
  visibleIncomingEvents,
  type IncomingTimelineEvent,
} from "./incomingEventsTimeline";

const ROW_HEIGHT = 28;

export interface IncomingEventDisplay extends IncomingTimelineEvent {
  sourceName: string;
  casterName: string;
  spellId: number | null;
  absorbSpellName?: string;
  absorbSpellId?: number | null;
}

interface IncomingEventsBreakoutProps {
  unitName: string;
  className: string;
  anchorOffsetMilli: number;
  anchorAbsoluteMilli: number;
  events: IncomingEventDisplay[];
  windowSeconds: number;
  onWindowSecondsChange: (seconds: number) => void;
  sharedCursorMilli: number | null;
  onSharedCursorChange: (cursorMilli: number | null) => void;
  onClose: () => void;
}

function formatRelativeTime(milli: number): string {
  return `${(milli / 1000).toFixed(1)}s`;
}

function eventColors(type: IncomingEventDisplay["type"]): string {
  if (type === "damage") return "bg-red-500/10 text-red-300";
  if (type === "absorbed") return "bg-blue-500/10 text-blue-300";
  return "bg-green-500/10 text-green-300";
}

export function IncomingEventsBreakout({
  unitName,
  className,
  anchorOffsetMilli,
  anchorAbsoluteMilli,
  events,
  windowSeconds,
  onWindowSecondsChange,
  sharedCursorMilli,
  onSharedCursorChange,
  onClose,
}: IncomingEventsBreakoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sync = useSyncModeContextOptional();
  const windowMilli = windowSeconds * 1000;

  const rows = useMemo(
    () => visibleIncomingEvents(events, anchorOffsetMilli, windowMilli),
    [events, anchorOffsetMilli, windowMilli],
  );
  const relativeTimes = useMemo(
    () => rows.map((event) => relativeEventTime(event.offsetMilli, anchorOffsetMilli)),
    [rows, anchorOffsetMilli],
  );

  const syncCursor = sync?.enabled && sync.currentTimestamp
    ? syncCursorForDeath(sync.currentTimestamp.getTime(), anchorAbsoluteMilli, windowMilli)
    : null;
  const cursorMilli = sync?.enabled ? syncCursor : sharedCursorMilli;
  const healthMessages = useMemo(
    () => relativeHealthMessagesAtCursor(
      events,
      anchorOffsetMilli,
      windowMilli,
      cursorMilli ?? -windowMilli,
    ),
    [events, anchorOffsetMilli, windowMilli, cursorMilli],
  );
  const healthState = useMemo(() => calculateRelativeHealth(healthMessages), [healthMessages]);
  const cursorY = cursorMilli === null
    ? null
    : timelineYForTime(relativeTimes, cursorMilli, ROW_HEIGHT, windowMilli);

  useEffect(() => {
    if (cursorY === null || collapsed) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const padding = 36;
    if (cursorY < viewport.scrollTop + padding) {
      viewport.scrollTo({ top: Math.max(0, cursorY - padding), behavior: "smooth" });
    } else if (cursorY > viewport.scrollTop + viewport.clientHeight - padding) {
      viewport.scrollTo({
        top: Math.max(0, cursorY - viewport.clientHeight + padding),
        behavior: "smooth",
      });
    }
  }, [cursorY, collapsed]);

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    if (sync?.enabled) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    onSharedCursorChange(timeAtTimelineY(
      relativeTimes,
      event.clientY - rect.top + viewport.scrollTop,
      ROW_HEIGHT,
      windowMilli,
    ));
  };

  const classColor = `var(--color-class-${className.toLowerCase()})`;

  return (
    <div className="overflow-hidden rounded border border-red-500/35 bg-[#111113] shadow-lg shadow-black/30">
      <div className="flex items-center gap-2 border-b border-white/5 px-2.5 py-1.5" data-drag-handle>
        <span className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: classColor, backgroundColor: classColor }} />
        <span className="text-xs font-semibold" style={{ color: classColor }}>{unitName}</span>
        <span className="text-2xs uppercase tracking-widest text-muted-foreground">{className}</span>
        <div className="flex-1" />
        <span className="font-mono text-2xs text-amber-200/80">
          {cursorMilli === null ? (sync?.enabled ? "waiting for window" : "hover to compare") : `${formatRelativeTime(cursorMilli)} ${sync?.enabled ? "playhead" : "cursor"}`}
        </span>
        <button type="button" className="rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        <button type="button" className="rounded p-0.5 text-red-400 hover:bg-red-500/15" onClick={onClose} aria-label={`Close ${unitName} breakout`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.01] px-3 py-1.5">
          <span className="mr-1 text-[9px] uppercase tracking-widest text-muted-foreground">Window</span>
          {[10, 15, 30, 45, 60].map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => onWindowSecondsChange(seconds)}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[9px]",
                windowSeconds === seconds
                  ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
              )}
            >
              {seconds}s
            </button>
          ))}
          <input
            type="number"
            min={5}
            max={120}
            value={windowSeconds}
            onChange={(event) => onWindowSecondsChange(Number(event.target.value))}
            className="ml-1 w-12 rounded border border-white/10 bg-[#191a1d] px-1.5 py-0.5 font-mono text-[9px] text-foreground"
            aria-label="Incoming events history in seconds"
          />
          <span className="text-[9px] text-muted-foreground">seconds before death</span>
        </div>
      )}

      <div className="border-b border-white/5 bg-white/[0.015] px-3 py-2">
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="text-2xs uppercase tracking-widest text-muted-foreground">Relative health change</span>
          <span className="text-[9px] text-muted-foreground/60">not actual health · max HP unknown</span>
          <div className="flex-1" />
        </div>
        <RelativeHealthBar messages={healthMessages} state={healthState} />
        <div className="mt-1.5 flex gap-4 font-mono text-2xs">
          <span className="text-red-300"><Swords className="mr-1 inline h-3 w-3" />{healthState.damage.toLocaleString()}</span>
          <span className="text-green-300"><HeartPulse className="mr-1 inline h-3 w-3" />{healthState.effectiveHealing.toLocaleString()}</span>
          <span className="text-blue-300"><Shield className="mr-1 inline h-3 w-3" />{healthState.prevented.toLocaleString()} prevented</span>
          {healthState.overhealing > 0 && <span className="text-green-200/45">+{healthState.overhealing.toLocaleString()} overheal</span>}
        </div>
      </div>

      {collapsed && (
        <div className="max-h-20 overflow-y-auto border-t border-white/5 px-3 py-1.5 styled-scrollbar">
          {rows
            .filter((entry) => cursorMilli !== null && relativeEventTime(entry.offsetMilli, anchorOffsetMilli) <= cursorMilli)
            .slice(0, 8)
            .reverse()
            .map((entry, index, visible) => (
              <div
                key={`ticker-${entry.eventIndex}-${entry.offsetMilli}-${entry.type}`}
                className="flex items-center gap-2 truncate font-mono text-[9px] leading-4"
                style={{ opacity: Math.max(0.25, (index + 2) / (visible.length + 1)) }}
              >
                <span className="w-10 shrink-0 text-muted-foreground">{formatRelativeTime(relativeEventTime(entry.offsetMilli, anchorOffsetMilli))}</span>
                <span className={cn("truncate", entry.type === "damage" ? "text-red-300" : entry.type === "absorbed" ? "text-blue-300" : "text-green-300")}>
                  {entry.casterName} · {entry.type === "absorbed" ? entry.absorbSpellName || entry.sourceName : entry.sourceName}
                </span>
              </div>
            ))}
        </div>
      )}

      {!collapsed && (
        <>
          <div className="grid grid-cols-[58px_120px_1fr_auto] border-b border-white/5 px-3 py-1 text-[9px] text-muted-foreground/70">
            <span>Time</span><span>Source</span><span>Ability</span><span>Amount</span>
          </div>
          <div
            ref={viewportRef}
            onMouseMove={handleMove}
            onMouseLeave={() => { if (!sync?.enabled) onSharedCursorChange(null); }}
            className="relative max-h-52 overflow-y-auto styled-scrollbar"
          >
            <div className="relative">
              {rows.map((entry) => {
                const effective = entry.type === "heal" ? Math.max(0, entry.amount - (entry.overheal ?? 0)) : entry.amount;
                return (
                  <div
                    key={`${entry.eventIndex}-${entry.offsetMilli}-${entry.type}`}
                    className={cn("grid grid-cols-[58px_120px_1fr_auto] items-center border-b border-white/[0.035] px-3 text-2xs", eventColors(entry.type))}
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span className="font-mono text-muted-foreground">{formatRelativeTime(relativeEventTime(entry.offsetMilli, anchorOffsetMilli))}</span>
                    <span className="truncate pr-2">{entry.casterName}</span>
                    <span className="truncate pr-2">
                      <SpellIdTooltip spellId={entry.type === "absorbed" ? entry.absorbSpellId ?? null : entry.spellId} name={entry.type === "absorbed" ? entry.absorbSpellName || entry.sourceName : entry.sourceName} size={13} />
                    </span>
                    <span className="font-mono">
                      {entry.type === "damage" ? "-" : entry.type === "absorbed" ? "◇" : "+"}{effective.toLocaleString()}
                      {entry.type === "heal" && entry.overheal ? <span className="ml-1 text-amber-300/70">+{entry.overheal.toLocaleString()}</span> : null}
                    </span>
                  </div>
                );
              })}
              {cursorY !== null && (
                <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: cursorY }}>
                  <div className="ml-10 h-0.5 bg-gradient-to-r from-amber-200 to-amber-200/20 shadow-[0_0_8px_rgba(253,230,138,.55)]" />
                  <div className="absolute -top-2.5 left-0 flex items-center">
                    <span className="rounded-sm border border-amber-200/40 bg-[#1b1a15] px-1 font-mono text-[9px] text-amber-200">{formatRelativeTime(cursorMilli!)}</span>
                    <span className="h-0 w-0 border-y-[5px] border-l-[6px] border-y-transparent border-l-amber-200" />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-white/5 px-3 py-1.5 font-mono text-[9px] text-muted-foreground">
            {rows.length} events · {windowSeconds}s window
          </div>
        </>
      )}
    </div>
  );
}
