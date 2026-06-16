/* eslint-disable react-refresh/only-export-components */
/**
 * Rotations panel — visualizes spell cast timelines per player/entity.
 *
 * Default view: one row per entity, all casts shown as icons on a shared timeline.
 * Focus view (single entity selected): one row per spell ability.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { RotateCcw, Minus, Plus } from "lucide-react";
import { iconUrl } from "@/config/iconUrl";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { PanelFilter } from "../processors/filters";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { rotationsProcessor, type RotationsResult, type RotationsEvent, type CastEntry, type AuraSegment, AUTO_ATTACK_SPELL_ID } from "./rotations.processor";

// ── Constants ─────────────────────────────────────────────────

const ICON_SIZE = 22;
const ROW_HEIGHT = 28;
const LABEL_WIDTH = 120;
const TIME_HEADER_HEIGHT = 24;
const MIN_PPS = 8;   // pixels per second minimum
const MAX_PPS = 400;  // pixels per second maximum
const DEFAULT_PPS = 50;

const ZOOM_STEPS = [8, 15, 25, 50, 100, 200, 400];

// ── Helpers ───────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatTimeMs(ms: number): string {
  const milli = ms % 1000;
  return `${formatTime(ms)}.${String(milli).padStart(3, "0")}`;
}

/** Compute nice tick interval in ms for the time axis. */
function getTickInterval(pps: number): number {
  // Target ~80-150px between ticks
  const targetPx = 100;
  const rawSec = targetPx / pps;
  // Snap to nice intervals
  const niceIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const iv of niceIntervals) {
    if (iv >= rawSec) return iv * 1000;
  }
  return 300_000;
}

// ── Cast icon on the timeline ─────────────────────────────────

function CastIcon({
  spellId,
  spellName,
  isFailed,
  style,
  onHide,
  offsetMilli,
  targetName,
  isOffHand,
}: {
  spellId: number;
  spellName: string;
  isFailed?: boolean;
  style: React.CSSProperties;
  onHide?: (spellId: number) => void;
  offsetMilli: number;
  targetName?: string;
  isOffHand?: boolean;
}) {
  const isAutoAttack = spellId === AUTO_ATTACK_SPELL_ID;
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(spellId), datasetId, {
    enabled: spellId > 0 && !isAutoAttack,
  });

  const castHeader = (
    <div className="rounded-t bg-zinc-900/95 border border-zinc-700 px-2.5 py-1.5 text-xs">
      <span className="text-zinc-300 font-mono">{formatTimeMs(offsetMilli)}</span>
      {targetName && (
        <span className="text-zinc-400 ml-2">→ <span className="text-zinc-200">{targetName}</span></span>
      )}
    </div>
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 && onHide) {
        e.preventDefault();
        e.stopPropagation();
        onHide(spellId);
      }
    },
    [spellId, onHide],
  );

  return (
    <div
      className="absolute"
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        ...style,
      }}
      onMouseDown={handleMouseDown}
    >
      {isAutoAttack ? (
        <TooltipProvider>
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <img
                src={iconUrl("inv_sword_04")}
                alt={isOffHand ? "Auto Attack - Offhand" : "Auto Attack"}
                width={ICON_SIZE}
                height={ICON_SIZE}
                className="rounded-sm border border-zinc-600/40 cursor-pointer"
                style={isOffHand ? { transform: "scaleX(-1)" } : undefined}
              />
            </TooltipTrigger>
            <TooltipContent
              side="right"
              align="start"
              sideOffset={8}
              className="p-0 bg-transparent border-0 z-[10000]"
              hideArrow
            >
              {castHeader}
              <div className="rounded-b bg-[#1a1a2e] border border-t-0 border-zinc-700 px-3 py-2 text-sm text-amber-200 font-medium">
                {isOffHand ? "Auto Attack - Offhand" : "Auto Attack"}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : spell ? (
        <SpellIconWithTooltip
          spell={spell}
          size={ICON_SIZE}
          className={isFailed ? "opacity-40" : undefined}
          tooltipHeader={castHeader}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-sm border border-zinc-700/60 bg-zinc-800 text-[9px] text-zinc-500"
          title={spellName}
        >
          {spellName.charAt(0)}
        </div>
      )}
    </div>
  );
}

/** Small icon shown in the hidden-spells bar. Click to unhide. */
function HiddenSpellIcon({
  spellId,
  spellName,
  onUnhide,
}: {
  spellId: number;
  spellName: string;
  onUnhide: (spellId: number) => void;
}) {
  const datasetId = useDatasetId();
  const isAutoAttack = spellId === AUTO_ATTACK_SPELL_ID;
  const { data: spell } = useSpell(String(spellId), datasetId, { enabled: spellId > 0 && !isAutoAttack });
  return (
    <button
      onClick={() => onUnhide(spellId)}
      className="flex items-center justify-center rounded-sm border border-zinc-600/50 opacity-50 hover:opacity-100 transition-opacity"
      style={{ width: 18, height: 18 }}
      title={`Show ${spellName} (click to restore)`}
    >
      {isAutoAttack ? (
        <img src={iconUrl("inv_sword_04")} alt="Auto Attack" width={16} height={16} className="rounded-sm" />
      ) : spell ? (
        <SpellIconWithTooltip spell={spell} size={16} showTooltip={false} />
      ) : (
        <span className="text-[8px] text-zinc-500">{spellName.charAt(0)}</span>
      )}
    </button>
  );
}

/** Tiny icon for the label column in focus mode. */
function FocusRowIcon({ spellId }: { spellId: number }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(spellId), datasetId, { enabled: spellId > 0 });
  if (!spell) return null;
  return <SpellIconWithTooltip spell={spell} size={14} />;
}

// ── Class colors ──────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  WARRIOR: "var(--color-class-warrior)",
  PALADIN: "var(--color-class-paladin)",
  HUNTER: "var(--color-class-hunter)",
  ROGUE: "var(--color-class-rogue)",
  PRIEST: "var(--color-class-priest)",
  SHAMAN: "var(--color-class-shaman)",
  MAGE: "var(--color-class-mage)",
  WARLOCK: "var(--color-class-warlock)",
  DRUID: "var(--color-class-druid)",
  DEATHKNIGHT: "var(--color-class-deathknight)",
  UNKNOWN: "var(--color-class-unknown)",
};

/** Sort priority for WoW classes (tanks → melee → ranged → healers). */
const CLASS_ORDER: Record<string, number> = {
  WARRIOR: 0,
  PALADIN: 1,
  ROGUE: 2,
  HUNTER: 3,
  SHAMAN: 4,
  DRUID: 5,
  MAGE: 6,
  WARLOCK: 7,
  PRIEST: 8,
  DEATHKNIGHT: 9,
};

// ── RotationsContent ──────────────────────────────────────────

interface RowData {
  key: string;
  label: string;
  className: string;
  casts: CastEntry[];
  /** Aura segments for this row's spell (focus view only) */
  auraSegments?: AuraSegment[];
  /** Aura uptime % (focus view only, 0-100) */
  uptimePct?: number;
}

/** Panel option format: "f:GUID;h:1,2,3" — focus GUID and hidden spell IDs */
interface PanelOptionState {
  focusGuid: string | null;
  hiddenSpellIds: Set<number>;
}

function parsePanelOption(option: string | null | undefined): PanelOptionState {
  const state: PanelOptionState = { focusGuid: null, hiddenSpellIds: new Set() };
  if (!option) return state;
  const focusMatch = option.match(/f:([^;]+)/);
  if (focusMatch) state.focusGuid = focusMatch[1];
  const hiddenMatch = option.match(/h:([\d,-]+)/);
  if (hiddenMatch) {
    state.hiddenSpellIds = new Set(hiddenMatch[1].split(",").map(Number).filter((n) => !isNaN(n)));
  }
  return state;
}

function serializePanelOption(state: PanelOptionState): string | null {
  const parts: string[] = [];
  if (state.focusGuid) parts.push(`f:${state.focusGuid}`);
  if (state.hiddenSpellIds.size > 0) parts.push(`h:${Array.from(state.hiddenSpellIds).join(",")}`);
  return parts.length > 0 ? parts.join(";") : null;
}

function RotationsContent({
  result,
  durationMs,
  context,
  processing,
  panelOption,
  setPanelOption,
}: PanelRenderProps<RotationsResult>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PPS);

  // Parse panel option state (focus + hidden spells)
  const optionState = useMemo(() => parsePanelOption(panelOption), [panelOption]);
  const hiddenSpellIds = optionState.hiddenSpellIds;

  const updateOption = useCallback((updater: (prev: PanelOptionState) => PanelOptionState) => {
    const current = parsePanelOption(panelOption);
    setPanelOption?.(serializePanelOption(updater(current)));
  }, [panelOption, setPanelOption]);

  const hideSpell = useCallback((spellId: number) => {
    updateOption((prev) => ({
      ...prev,
      hiddenSpellIds: new Set(prev.hiddenSpellIds).add(spellId),
    }));
  }, [updateOption]);

  const unhideSpell = useCallback((spellId: number) => {
    updateOption((prev) => {
      const next = new Set(prev.hiddenSpellIds);
      next.delete(spellId);
      return { ...prev, hiddenSpellIds: next };
    });
  }, [updateOption]);

  const focusEntity = useCallback((guid: string) => {
    updateOption((prev) => ({
      ...prev,
      focusGuid: prev.focusGuid === guid ? null : guid,
    }));
  }, [updateOption]);

  // Panel-local focus: use panelOption focus GUID, fall back to global entitySelection
  const focusGuid = optionState.focusGuid;
  const isFocused = focusGuid != null || 
    context.entitySelection.playerIds.size === 1 ||
    context.entitySelection.enemyIds.size === 1;

  // Build rows
  const rows: RowData[] = useMemo(() => {
    if (isFocused) {
      // Focus mode: group by spell ability
      // Panel-local focus takes priority over global entitySelection
      const focusedId =
        focusGuid ||
        [...context.entitySelection.playerIds][0] ||
        [...context.entitySelection.enemyIds][0];
      const casts = focusedId ? result.castsByEntity.get(focusedId) : undefined;
      if (!casts || casts.length === 0) return [];

      // Get aura segments for this entity
      const entityAuras = focusedId ? result.aurasByEntity.get(focusedId) : undefined;

      // Group casts by spellId
      const bySpell = new Map<number, CastEntry[]>();
      for (const c of casts) {
        let list = bySpell.get(c.spellId);
        if (!list) {
          list = [];
          bySpell.set(c.spellId, list);
        }
        list.push(c);
      }

      // Group aura segments by spellId
      const aurasBySpell = new Map<number, AuraSegment[]>();
      if (entityAuras) {
        for (const seg of entityAuras) {
          let list = aurasBySpell.get(seg.spellId);
          if (!list) {
            list = [];
            aurasBySpell.set(seg.spellId, list);
          }
          list.push(seg);
        }
      }

      // Merge: include spells that have casts OR aura segments
      const allSpellIds = new Set([...bySpell.keys(), ...aurasBySpell.keys()]);

      return Array.from(allSpellIds)
        .map((spellId) => {
          const spellCasts = bySpell.get(spellId) || [];
          const segments = aurasBySpell.get(spellId);
          // Compute uptime % if there are aura segments
          let uptimePct: number | undefined;
          if (segments && segments.length > 0 && durationMs > 0) {
            let totalUp = 0;
            for (const s of segments) {
              const end = Math.min(s.endMilli ?? durationMs, durationMs);
              totalUp += end - s.startMilli;
            }
            uptimePct = Math.min(100, (totalUp / durationMs) * 100);
          }
          return {
            key: `spell-${spellId}`,
            label: result.spellNames.get(spellId) || `Spell ${spellId}`,
            className: "",
            casts: spellCasts,
            auraSegments: segments,
            uptimePct,
          };
        })
        .sort((a, b) => {
          // Rows with casts first (by count desc), then aura-only rows by uptime desc
          if (a.casts.length > 0 && b.casts.length === 0) return -1;
          if (a.casts.length === 0 && b.casts.length > 0) return 1;
          if (a.casts.length > 0 && b.casts.length > 0) return b.casts.length - a.casts.length;
          return (b.uptimePct ?? 0) - (a.uptimePct ?? 0);
        });
    } else {
      // Default mode: one row per entity, grouped by class then sorted by cast count
      return Array.from(result.castsByEntity.entries())
        .map(([guid, casts]) => {
          const player = context.instance.players?.[guid];
          const unit = context.instance.units?.[guid];
          const name = player?.name || unit?.name || guid.slice(-6);
          const cls = player?.class?.toUpperCase() || "UNKNOWN";
          return { key: guid, label: name, className: cls, casts };
        })
        .sort((a, b) => {
          const classA = CLASS_ORDER[a.className] ?? 99;
          const classB = CLASS_ORDER[b.className] ?? 99;
          if (classA !== classB) return classA - classB;
          return b.casts.length - a.casts.length;
        });
    }
  }, [result, isFocused, focusGuid, context, durationMs]);

  // Filter out hidden spells from each row's casts
  const filteredRows = useMemo(() => {
    if (hiddenSpellIds.size === 0) return rows;
    if (isFocused) {
      // In focus mode, hide entire rows for hidden spells
      return rows.filter((row) => {
        const spellId = row.casts[0]?.spellId;
        return spellId === undefined || !hiddenSpellIds.has(spellId);
      });
    }
    // Default mode: filter casts within each row
    return rows
      .map((row) => ({
        ...row,
        casts: row.casts.filter((c) => !hiddenSpellIds.has(c.spellId)),
      }))
      .filter((row) => row.casts.length > 0);
  }, [rows, hiddenSpellIds, isFocused]);

  // Build hidden spell info for the header bar
  const hiddenSpells = useMemo(() => {
    return Array.from(hiddenSpellIds).map((id) => ({
      spellId: id,
      spellName: result.spellNames.get(id) || `Spell ${id}`,
    }));
  }, [hiddenSpellIds, result.spellNames]);

  // Total timeline width in px
  const effectiveDuration = durationMs > 0 ? durationMs : getMaxOffset(result.castsByEntity);
  const totalWidth = Math.max(200, (effectiveDuration / 1000) * pixelsPerSecond);

  // Time axis ticks
  const tickIntervalMs = getTickInterval(pixelsPerSecond);
  const ticks: number[] = useMemo(() => {
    const t: number[] = [];
    for (let ms = 0; ms <= effectiveDuration + tickIntervalMs; ms += tickIntervalMs) {
      t.push(ms);
    }
    return t;
  }, [effectiveDuration, tickIntervalMs]);

  // Shift+Scroll horizontal panning
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.shiftKey && scrollRef.current) {
        e.preventDefault();
        scrollRef.current.scrollLeft += e.deltaY;
      }
    },
    [],
  );

  // Zoom controls
  const zoomLabel = useMemo(() => {
    const ratio = pixelsPerSecond / DEFAULT_PPS;
    if (ratio >= 1) return `${Math.round(ratio)}x`;
    return `${ratio.toFixed(1)}x`;
  }, [pixelsPerSecond]);

  const zoomIn = useCallback(() => {
    setPixelsPerSecond((prev) => {
      const idx = ZOOM_STEPS.indexOf(prev);
      if (idx >= 0 && idx < ZOOM_STEPS.length - 1) return ZOOM_STEPS[idx + 1];
      return Math.min(prev * 2, MAX_PPS);
    });
  }, []);

  const zoomOut = useCallback(() => {
    setPixelsPerSecond((prev) => {
      const idx = ZOOM_STEPS.indexOf(prev);
      if (idx > 0) return ZOOM_STEPS[idx - 1];
      return Math.max(prev / 2, MIN_PPS);
    });
  }, []);

  if (context.selectedEncounterIds.length !== 1) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500 text-sm">
        Select a single encounter to view rotations
      </div>
    );
  }

  // Don't render stale data while worker is reprocessing
  if (processing) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500 text-sm">
        Processing…
      </div>
    );
  }

  if (filteredRows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500 text-sm">
        No cast data available
      </div>
    );
  }

  return (
    <div className="flex flex-col text-xs min-h-0 h-full overflow-hidden">
      {/* Zoom controls */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={zoomOut}
          className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          title="Zoom out"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-[28px] text-center text-zinc-400 text-[10px] font-mono">
          {zoomLabel}
        </span>
        <button
          onClick={zoomIn}
          className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          title="Zoom in"
        >
          <Plus className="h-3 w-3" />
        </button>
        <span className="ml-2 text-zinc-600 text-[10px]">
          Shift+Scroll to pan
        </span>

        {/* Focused entity indicator */}
        {focusGuid && (() => {
          const player = context.instance.players?.[focusGuid];
          const unit = context.instance.units?.[focusGuid];
          const name = player?.name || unit?.name || focusGuid.slice(-6);
          const cls = player?.class?.toUpperCase() || "UNKNOWN";
          return (
            <button
              onClick={() => focusEntity(focusGuid)}
              className="ml-2 flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 hover:bg-zinc-700 text-[10px]"
              title="Click to unfocus"
            >
              <span style={{ color: CLASS_COLORS[cls] || CLASS_COLORS.UNKNOWN }}>{name}</span>
              <span className="text-zinc-500">✕</span>
            </button>
          );
        })()}

        {/* Hidden spells */}
        {hiddenSpells.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-zinc-600 text-[10px]">Hidden:</span>
            {hiddenSpells.map((s) => (
              <HiddenSpellIcon
                key={s.spellId}
                spellId={s.spellId}
                spellName={s.spellName}
                onUnhide={unhideSpell}
              />
            ))}
          </div>
        )}
      </div>

      {/* Timeline area — flex-1 fills remaining card space, overflow scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar">
        <div className="flex">
          {/* Fixed label column — sticky so it stays visible during horizontal scroll */}
          <div className="flex-shrink-0 sticky left-0 z-10" style={{ width: LABEL_WIDTH }}>
            {/* Empty header space */}
            <div
              className="border-b border-zinc-800"
              style={{ height: TIME_HEADER_HEIGHT }}
            />
            {filteredRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center truncate border-b border-zinc-800/50 px-2 text-zinc-300"
                style={{ height: ROW_HEIGHT }}
                title={row.label}
              >
                {!isFocused ? (
                  <span
                    className="truncate font-medium cursor-pointer hover:underline"
                    style={{ color: CLASS_COLORS[row.className] || CLASS_COLORS.UNKNOWN }}
                    onClick={() => focusEntity(row.key)}
                  >
                    {row.label}
                  </span>
                ) : (
                  <div className="flex items-center gap-1 truncate">
                    <FocusRowIcon spellId={row.casts[0]?.spellId ?? (row.auraSegments?.[0]?.spellId ?? 0)} />
                    <span className="truncate">{row.label}</span>
                    {row.uptimePct != null && (
                      <span className="ml-auto flex-shrink-0 text-[9px] text-emerald-500/70 font-mono">
                        {Math.round(row.uptimePct)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Scrollable timeline */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-x-auto styled-scrollbar"
            onWheel={handleWheel}
          >
            <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
              {/* Full-height vertical gridlines behind all content */}
              {ticks.map((ms) => (
                <div
                  key={`grid-${ms}`}
                  className="absolute top-0 bottom-0 w-px bg-zinc-700/30"
                  style={{ left: (ms / 1000) * pixelsPerSecond }}
                />
              ))}

              {/* Time axis header */}
              <div
                className="relative border-b border-zinc-800 text-zinc-600"
                style={{ height: TIME_HEADER_HEIGHT }}
              >
                {ticks.map((ms) => {
                  const left = (ms / 1000) * pixelsPerSecond;
                  return (
                    <div
                      key={ms}
                      className="absolute top-0 flex flex-col items-start"
                      style={{ left }}
                    >
                      <div className="h-full w-px bg-zinc-700" />
                      <span className="mt-0.5 text-[9px] font-mono whitespace-nowrap pl-0.5">
                        {formatTime(ms)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Cast rows */}
              {filteredRows.map((row) => (
                <div
                  key={row.key}
                  className="relative border-b border-zinc-800/50"
                  style={{ height: ROW_HEIGHT }}
                >

                  {/* Aura duration bars (focus view) */}
                  {isFocused && row.auraSegments?.map((seg, i) => {
                    const startPx = (seg.startMilli / 1000) * pixelsPerSecond;
                    const endMs = Math.min(seg.endMilli ?? durationMs, durationMs);
                    const widthPx = Math.max(1, ((endMs - seg.startMilli) / 1000) * pixelsPerSecond);
                    return (
                      <div
                        key={`aura-${i}`}
                        className="absolute rounded-sm bg-emerald-500/20 border border-emerald-500/10"
                        style={{
                          left: startPx,
                          width: widthPx,
                          top: 2,
                          bottom: 2,
                        }}
                      />
                    );
                  })}

                  {/* Cast icons */}
                  {row.casts.map((cast, i) => {
                    const left = (cast.offsetMilli / 1000) * pixelsPerSecond;
                    const tp = cast.target ? context.instance.players?.[cast.target] : undefined;
                    const tu = cast.target ? context.instance.units?.[cast.target] : undefined;
                    const tn = tp?.name || tu?.name || undefined;
                    return (
                      <CastIcon
                        key={i}
                        spellId={cast.spellId}
                        spellName={cast.spellName}
                        isFailed={cast.eventType === "spell_fail"}
                        onHide={hideSpell}
                        offsetMilli={cast.offsetMilli}
                        targetName={tn}
                        isOffHand={cast.isOffHand}
                        style={{
                          left,
                          top: (ROW_HEIGHT - ICON_SIZE) / 2,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function getMaxOffset(castsByEntity: Map<string, CastEntry[]>): number {
  let max = 0;
  for (const casts of castsByEntity.values()) {
    for (const c of casts) {
      if (c.offsetMilli > max) max = c.offsetMilli;
    }
  }
  return max + 2000; // Add 2s padding
}

// ── Panel definition ──────────────────────────────────────────

export function createRotationsPanel(): PanelDefinition<RotationsResult, RotationsEvent> {
  return {
    ...rotationsProcessor,
    label: "Rotations",
    icon: <RotateCcw className="h-4 w-4" />,
    supportsPerSecond: false,
    hidden: true,
    supportsFiltering: true,
    defaultFilters: [
      { type: "source_type" as PanelFilter["type"], value: ["player"] },
    ],
    render: (props: PanelRenderProps<RotationsResult>) => (
      <RotationsContent {...props} />
    ),
  };
}
