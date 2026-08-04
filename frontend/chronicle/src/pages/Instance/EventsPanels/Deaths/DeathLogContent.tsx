/**
 * DeathLogContent - Chronological list of player and enemy deaths with timestamps
 */

import React, { useMemo, useCallback, useState } from "react";
import { User, Skull, ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { GenericPanel } from "../GenericPanel";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import type { PanelRenderProps } from "../types";
import type { DeathsResult, DeathEvent } from "./deaths.processor";
import { DeathRecap } from "./DeathRecap";
import {
  IncomingEventsBreakout,
  type IncomingEventsWindow,
} from "../IncomingEvents/IncomingEventsBreakout";
import { FloatingIncomingEventsBreakout } from "../IncomingEvents/FloatingIncomingEventsBreakout";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { hasDeathLogEvents, isDeathAheadOfSyncCursor } from "./deathLogSync";
import { cn } from "@/lib/utils";
import { hitTypeNames, HitTypeCrit } from "@/lib/hittype/hittype";

import { extractDeathWindow, normalizeDeathWindow, updateDeathWindow } from "./deathBreakoutWindow";

type DeathMode = "players" | "enemies";


function formatTimestamp(absoluteMilli: number): string {
  const eventTime = new Date(absoluteMilli);
  return eventTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Format relative time within encounter (e.g., "+1:23.4")
 */
function formatRelativeTime(offsetMilli: number): string {
  const totalSeconds = offsetMilli / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return `+${minutes}:${seconds.padStart(4, "0")}`;
}

/**
 * Get school name from school enum value
 */
function getSchoolName(school: number): string {
  const schools: Record<number, string> = {
    0: "Unknown",
    1: "None",
    2: "Physical",
    3: "Holy",
    4: "Fire",
    5: "Nature",
    6: "Frost",
    7: "Shadow",
    8: "Arcane",
  };
  return schools[school] || "Unknown";
}

/**
 * Get school color for styling
 */
function getSchoolColor(school: number): string {
  const colors: Record<number, string> = {
    2: "text-amber-200",      // Physical
    3: "text-yellow-300",     // Holy
    4: "text-orange-500",     // Fire
    5: "text-green-400",      // Nature
    6: "text-cyan-400",       // Frost
    7: "text-purple-400",     // Shadow
    8: "text-blue-400",       // Arcane
  };
  return colors[school] || "text-muted-foreground";
}

/**
 * Sort death events by offsetMilli and return chronological list.
 */
function getSortedDeathEvents(selectedEncounterIDs: string[], result: DeathsResult, mode: DeathMode): DeathEvent[] {
  const events = mode === "players" ? result.DeathEvents : result.EnemyDeathEvents;
  return [...events].filter((event) => selectedEncounterIDs.includes(event.encounterID));
}

type DeathLogContentProps = PanelRenderProps<DeathsResult>;

function extractDeathMode(panelOption: string | null | undefined): DeathMode {
  if (!panelOption) return "players";
  const token = panelOption.split(",").find((t) => t.trim().startsWith("m:"));
  const val = token?.slice(2);
  return val === "enemies" ? "enemies" : "players";
}

interface FloatingDeathRecap {
  death: DeathEvent;
  initialPosition: { x: number; y: number };
}

export const DeathLogContent = (props: DeathLogContentProps) => {
  const { result, context, loading, processing, checkboxChecked, panelOption, setPanelOption } = props;
  const syncMode = useSyncModeContextOptional();
  const [mode, setModeLocal] = useState<DeathMode>(() => extractDeathMode(panelOption));
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [floatingRecaps, setFloatingRecaps] = useState<Map<string, FloatingDeathRecap>>(() => new Map());
  const [sharedFightOffsetMilli, setSharedFightOffsetMilli] = useState<number | null>(null);
  const [breakoutWindow, setBreakoutWindowLocal] = useState<IncomingEventsWindow>(() => extractDeathWindow(panelOption));

  const setMode = useCallback((next: DeathMode) => {
    setModeLocal(next);
    if (setPanelOption) {
      // Preserve other tokens, replace/add m: token
      const existing = (panelOption ?? "").split(",").filter((t) => t.trim() && !t.trim().startsWith("m:"));
      existing.push(`m:${next}`);
      setPanelOption(existing.join(","));
    }
  }, [panelOption, setPanelOption]);

  const setBreakoutWindow = useCallback((window: IncomingEventsWindow) => {
    const next = normalizeDeathWindow(window);
    setBreakoutWindowLocal(next);
    if (setPanelOption) setPanelOption(updateDeathWindow(panelOption, next));
  }, [panelOption, setPanelOption]);

  const openFloatingRecap = useCallback((key: string, death: DeathEvent, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.right + 8, window.innerWidth - 640));
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 520));
    setFloatingRecaps((current) => {
      const next = new Map(current);
      next.set(key, { death, initialPosition: { x, y } });
      return next;
    });
  }, []);

  const closeFloatingRecap = useCallback((key: string) => {
    setFloatingRecaps((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  // Build encounter name lookup
  const encounterNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const enc of context.instance.encounters) {
      map.set(enc.id, enc.name);
    }
    return map;
  }, [context.instance.encounters]);

  // Handle encounter link click
  const handleEncounterClick = useCallback((encounterId: string) => {
    context.onSelectEncounters?.([encounterId]);
  }, [context]);

  // Death Log declares syncDataMode "full", so this result always comes from the
  // worker with complete encounter data — even while Sync playback is running.
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    hasDeathLogEvents,
    [props.panelContextVersion]
  );

  const sortedDeaths = useMemo(
    () => getSortedDeathEvents(context.selectedEncounterIds, cachedResult, mode),
    [context.selectedEncounterIds, cachedResult, mode],
  );

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <>
    <GenericPanel {...effectiveProps}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">
          Total Deaths: <span className="font-medium text-foreground">{sortedDeaths.length}</span>
        </div>
        {/* Player/Enemy toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5" data-death-mode-toggle>
          <button
            type="button"
            onClick={() => setMode("players")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
              mode === "players"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Show player deaths"
          >
            <User className="h-3 w-3" />
            <span>Players</span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setMode("enemies")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
                  mode === "enemies"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Skull className="h-3 w-3" />
                <span>Enemies</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Show enemy deaths</p>
              <p className="text-muted-foreground text-2xs">Note: Some enemies may have 2 death messages in the combat log</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {sortedDeaths.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          {loading || processing ? "Loading..." : "No deaths recorded"}
        </div>
      ) : (
        <ScrollArea className="max-h-panel">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="w-5" />
                <th className="text-left py-1.5 px-2 font-medium w-16">Time</th>
                <th className="text-left py-1.5 px-2 font-medium w-16">Encounter</th>
                <th className="text-left py-1.5 px-2 font-medium w-28">Killed By</th>
                <th className="text-left py-1.5 px-2 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {sortedDeaths.map((death, index) => {
                const encounterName = encounterNames.get(death.encounterID) || "Unknown";
                const prevDeath = index > 0 ? sortedDeaths[index - 1] : null;
                const isNewEncounter = prevDeath && prevDeath.encounterID !== death.encounterID;
                const isExpanded = expandedIndex === index;
                const isPendingSyncDeath = isDeathAheadOfSyncCursor(
                  death,
                  syncMode?.enabled === true,
                  syncMode?.currentTimestamp ?? null,
                );
                const rowKey = `${death.encounterID}:${death.playerID}:${death.offsetMilli}:${index}`;
                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      className={cn(
                        "border-b border-border/10 hover:bg-muted/50 cursor-pointer",
                        isNewEncounter && "border-t-2 border-t-border",
                        isExpanded && "bg-muted/30 border-b-0",
                        isPendingSyncDeath && "opacity-35 saturate-50"
                      )}
                      data-death-row={index === 0 ? true : undefined}
                      data-lesson-target="death-recap"
                      data-sync-pending={isPendingSyncDeath || undefined}
                      onClick={() => setExpandedIndex(isExpanded ? null : index)}
                    >
                      <td className="py-1 px-1 text-muted-foreground w-5">
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />
                        }
                      </td>
                      <td className="py-1 px-2 font-mono text-muted-foreground font-mono text-2xs">
                        {checkboxChecked 
                          ? formatRelativeTime(death.offsetMilli)
                          : formatTimestamp(death.dateMilli)
                        }
                      </td>
                      <td className="py-1 px-2 max-w-[120px]">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleEncounterClick(death.encounterID); }}
                          className={cn(
                            "text-left text-2xs truncate max-w-full",
                            "text-blue-500 hover:text-blue-400 hover:underline cursor-pointer"
                          )}
                          title={`Select ${encounterName}`}
                          data-death-encounter-link={index === 0 ? true : undefined}
                        >
                          {encounterName}
                        </button>
                      </td>
                                          <td className="py-1 px-2 text-muted-foreground w-24 max-w-24" data-death-killer={index === 0 ? true : undefined}>
                        {death.attribution ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate cursor-help underline decoration-dotted decoration-muted-foreground/50">
                                {death.killerName || "Unknown"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" hideArrow className="max-w-[250px] bg-popover text-popover-foreground border border-border">
                              <div className="space-y-1">
                                <div className="font-medium">{death.killerName || "Unknown"}</div>
                                <div className="text-xs text-muted-foreground">{death.attribution.sourceName}</div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className={cn("font-medium", getSchoolColor(death.attribution.school))}>
                                    {death.attribution.amount.toLocaleString()}
                                  </span>
                                  {death.attribution.school > 1 && (
                                    <span className="text-muted-foreground">
                                      {getSchoolName(death.attribution.school)}
                                    </span>
                                  )}
                                  {(death.attribution.hitType & HitTypeCrit) !== 0 && (
                                    <span className="text-yellow-500 font-medium">Crit!</span>
                                  )}
                                </div>
                                {death.attribution.hitType !== 0 && (
                                  <div className="text-2xs text-muted-foreground">
                                    {hitTypeNames(death.attribution.hitType).join(", ")}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="block truncate" title={death.killerName}>
                            {death.killerName || "Unknown"}
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate font-medium"
                            style={{ color: `var(--color-class-${death.className.toLowerCase()})` }}
                          >
                            {death.playerName}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openFloatingRecap(rowKey, death, event.currentTarget);
                            }}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            data-lesson-target="floating-recap"
                            title="Open floating death recap"
                            aria-label={`Open floating death recap for ${death.playerName}`}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={cn("border-b border-border/10", isPendingSyncDeath && "opacity-35 saturate-50")}>
                        <td colSpan={5} className="p-0 pb-1">
                          <DeathRecap
                            recap={death.recap.filter((entry) => entry.offsetMilli >= death.offsetMilli - 10_000)}
                            outgoingRecap={death.outgoingRecap.filter((entry) => entry.offsetMilli >= death.offsetMilli - 10_000)}
                            deathOffsetMilli={death.offsetMilli}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </GenericPanel>
    {Array.from(floatingRecaps.entries()).map(([key, { death, initialPosition }]) => (
      <FloatingIncomingEventsBreakout
        key={key}
        initialPosition={initialPosition}
        onClose={() => closeFloatingRecap(key)}
      >
        <IncomingEventsBreakout
          unitName={death.playerName}
          className={death.className}
          anchorOffsetMilli={death.offsetMilli}
          anchorAbsoluteMilli={death.dateMilli}
          events={death.recap}
          window={breakoutWindow}
          onWindowChange={setBreakoutWindow}
          sharedFightOffsetMilli={sharedFightOffsetMilli}
          onSharedFightOffsetChange={setSharedFightOffsetMilli}
          onClose={() => closeFloatingRecap(key)}
        />
      </FloatingIncomingEventsBreakout>
    ))}
    </>
  );
};
