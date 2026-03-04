import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Skull, CheckCircle, AlertTriangle, ChevronDown, ChevronRight, Clock, PanelLeftClose, PanelLeft, Users, Crown, List, FolderTree, X, HelpCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useHelpfulHints } from "@/hooks/useHelpfulHints";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useInstanceViewState, type PanelType } from "@/hooks/useUrlState";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { ActivityPeriod, InstancePlayer } from "@/api/typesGenerated";
import { PeriodMomentDisplay } from "@/components/PeriodMomentDisplay";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/Collapsible/Collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, HintTooltip } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { Instance, Encounter, EnemyUnit } from "./InstancePage";
import { EventsPanel, type EventsPanelType, type PanelContext, type EntitySelection } from "./EventsPanels";
import { PANELS } from "./EventsPanels/EventsPanel";
import { PanelTimingProvider, PanelTimingDisplay, PanelTimingResetter } from "./EventsPanels/PanelTimingContext";
import { PanelExplainerView } from "./PanelExplainer";
import { RandomTip } from "@/components/RandomTip";
import { InstanceHelpSheet } from "@/components/HelpSheet";
import { ENCOUNTER_TIPS, ENTITY_TIPS, CLASS_TOGGLE_TIPS } from "@/constants/tips";
import { InstanceMenu } from "./InstanceMenu";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  ALTERNATE_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
} from "./viewDefaults";

// ============================================================================
// Encounter selector localStorage helpers (7-day expiry)
// ============================================================================

const ENCOUNTER_SELECTOR_SEEN_KEY = "encounter-selector-seen";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function hasSeenEncounterSelector(): boolean {
  try {
    const stored = localStorage.getItem(ENCOUNTER_SELECTOR_SEEN_KEY);
    if (!stored) return false;
    const { expiresAt } = JSON.parse(stored);
    return Date.now() < expiresAt;
  } catch {
    return false;
  }
}

function markEncounterSelectorSeen(): void {
  localStorage.setItem(
    ENCOUNTER_SELECTOR_SEEN_KEY,
    JSON.stringify({ expiresAt: Date.now() + SEVEN_DAYS_MS })
  );
}

// ============================================================================
// Formatting helpers
// ============================================================================

// WoW combat log format: "1/2 15:04:05.000" (month/day without leading zeros)
function formatAsLogTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const month = d.getMonth() + 1; // 0-indexed
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${month}/${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

async function copyEncounterTimes(startTime: string, endTime: string) {
  const start = formatAsLogTime(startTime);
  const end = formatAsLogTime(endTime);
  const text = `${start} - ${end}`;
  await navigator.clipboard.writeText(text);
  toast.success("Copied encounter times", { description: text });
}

function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end.getTime() - start.getTime();
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function computePeriodDuration(period: ActivityPeriod): number | null {
  if (!period.start || !period.end) return null;
  const startMs = new Date(period.start.timestamp).getTime();
  const endMs = new Date(period.end.timestamp).getTime();
  return endMs - startMs;
}

function formatPeriodsTooltip(guid: string, periods: readonly ActivityPeriod[]): React.ReactNode {
  if (!periods || periods.length === 0) {
    return (
      <div className="space-y-2 max-w-xs">
        <span className="text-muted-foreground">No activity data</span>
      </div>
    );
  }

  // Calculate total duration across all periods
  const totalDuration = periods.reduce((sum, period) => {
    const duration = computePeriodDuration(period);
    return sum + (duration ?? 0);
  }, 0);

  return (
    <div className="space-y-2 max-w-xs">
      <div className="font-medium border-b border-border pb-1">
        Activity: {formatDurationMs(totalDuration)}
      </div>
      {periods.map((period, idx) => {
        const duration = computePeriodDuration(period);
        return (
          <div key={idx} className="text-xs space-y-0.5">
            <div className="font-medium text-foreground/80 flex items-center gap-2">
              <span>Period {idx + 1}</span>
              {duration !== null && (
                <span className="text-muted-foreground font-normal">
                  ({formatDurationMs(duration)})
                </span>
              )}
              <span className={period.end_state === "slain" ? "text-green-400" : "text-red-400"}>
                {period.end_state === "slain" ? "✓" : "✗"}
              </span>
            </div>
          </div>
        );
      })}
      
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Debug
        </summary>
        <div className="mt-2 space-y-2 font-mono text-[10px] text-muted-foreground">
          <div>GUID: <span className="break-all">{guid}</span></div>
          {periods.map((period, idx) => (
            <div key={idx} className="border-l border-border pl-2 space-y-2">
              <PeriodMomentDisplay moment={period.start} label="Start" />
              <PeriodMomentDisplay moment={period.end} label="End" />
              <PeriodMomentDisplay moment={period.last_active} label="Last Active" />
              <div>End State: {period.end_state ?? "active"}</div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function computeTotalDuration(encounters: Encounter[]): number {
  return encounters.reduce((total, e) => {
    const start = new Date(e.start_time).getTime();
    const end = new Date(e.end_time).getTime();
    return total + (end - start);
  }, 0);
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

// ============================================================================
// Trash grouping
// ============================================================================

interface TrashGroup {
  name: string;
  encounters: Encounter[];
  kills: number;
  wipes: number;
}

function groupTrashEncounters(encounters: Encounter[]): TrashGroup[] {
  const trashEncounters = encounters.filter((e) => !e.boss);
  const groups = new Map<string, Encounter[]>();

  for (const encounter of trashEncounters) {
    const existing = groups.get(encounter.name) || [];
    existing.push(encounter);
    groups.set(encounter.name, existing);
  }

  return Array.from(groups.entries()).map(([name, encs]) => ({
    name,
    encounters: encs,
    kills: encs.filter((e) => e.kill_type !== "wipe").length,
    wipes: encs.filter((e) => e.kill_type === "wipe").length,
  }));
}

// ============================================================================
// Enemy merging
// ============================================================================

interface MergedEnemy extends Omit<EnemyUnit, 'periods'> {
  killed: boolean;
  periods: ActivityPeriod[];
}

function mergeEnemies(encounters: Encounter[]): MergedEnemy[] {
  const enemyMap = new Map<string, MergedEnemy>();
  const remainingSet = new Set<string>();
  for (const encounter of encounters) {
    if (encounter.remaining) {
      for (const guid of encounter.remaining) {
        remainingSet.add(guid);
      }
    }
  }

  for (const encounter of encounters) {
    const enemies = encounter.enemies;
    if (!enemies) continue;

    for (const enemy of enemies) {
      const existing = enemyMap.get(enemy.id);
      
      if (existing) {
        existing.damageTaken += enemy.damageTaken;
        existing.damageDone += enemy.damageDone;
        existing.periods = [...existing.periods, ...enemy.periods];
      } else {
        enemyMap.set(enemy.id, {
          ...enemy,
          periods: [...enemy.periods],
          killed: !remainingSet.has(enemy.id),
        });
      }
    }
  }

  return Array.from(enemyMap.values()).sort((a, b) => b.damageTaken - a.damageTaken);
}

/**
 * Merge enemies sorted by GUID for stable URL indexing.
 * GUID sort ensures indices don't change when damage values update.
 */
function mergeEnemiesByGuid(encounters: Encounter[]): MergedEnemy[] {
  const enemies = mergeEnemies(encounters);
  // Sort by GUID (id) for stable ordering - indices won't change if damage changes
  return enemies.sort((a, b) => a.id.localeCompare(b.id));
}

// ============================================================================
// EncounterSidebar component
// ============================================================================

function EncounterSidebar({
  encounters,
  trashGroups,
  selectedIds,
  onSelect,
  onSelectMany,
  onCollapse,
  isMobile,
  showHints,
}: {
  encounters: Encounter[];
  trashGroups: TrashGroup[];
  selectedIds: string[];
  onSelect: (id: string, mode: 'single' | 'toggle') => void;
  onSelectMany: (ids: string[]) => void;
  onCollapse: () => void;
  isMobile: boolean;
  showHints: boolean;
}) {
  const bossEncounters = encounters
    .filter((e) => e.boss)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const trashEncounterIds = trashGroups.flatMap(g => g.encounters.map(e => e.id));
  const totalTrash = trashGroups.reduce((sum, g) => sum + g.encounters.length, 0);

  const groupsWithSelectedTrash = trashGroups
    .filter(g => g.encounters.some(e => selectedIds.includes(e.id)))
    .map(g => g.name);
  const hasSelectedTrash = groupsWithSelectedTrash.length > 0;

  const [trashOpen, setTrashOpen] = useState(false);
  const [manualExpandedGroup, setManualExpandedGroup] = useState<string | null>(null);
  const [showChronological, setShowChronological] = useState(false);
  const [searchParams] = useSearchParams();
  const isDebug = searchParams.get("debug") === "true";

  const effectiveTrashOpen = trashOpen || hasSelectedTrash;
  
  // Sort encounters by start time for chronological view
  const chronologicalEncounters = useMemo(() => 
    [...encounters].sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    ),
    [encounters]
  );
  
  const isGroupExpanded = (groupName: string) => 
    manualExpandedGroup === groupName || groupsWithSelectedTrash.includes(groupName);

  const handleClick = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      onSelect(id, 'toggle');
    } else {
      onSelect(id, 'single');
    }
  };

  return (
    <div 
      data-help-encounter-sidebar
      className={cn(
        "pt-1 w-64 shrink-0 border-r pr-4 overflow-y-auto styled-scrollbar",
        // Desktop: sticky sidebar that scrolls independently
        !isMobile && "sticky top-4 max-h-[calc(100vh-2rem)]",
        // Mobile: fixed overlay with background
        isMobile && "fixed inset-y-0 left-0 z-50 bg-background border-r shadow-lg pl-4 pt-4"
      )}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            Encounters
            {showHints && (
              <HintTooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground/50 hover:text-muted-foreground">
                    <HelpCircle className="h-3 w-3" />
                    <span className="sr-only">Tips</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                  <RandomTip id="encounters" tips={ENCOUNTER_TIPS} />
                </TooltipContent>
              </HintTooltip>
            )}
            {selectedIds.length > 1 && (
              <span className="text-xs">({selectedIds.length})</span>
            )}
          </h3>
          <div className="flex gap-1 mt-1.5" data-help-quick-select>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-xs"
              onClick={() => onSelectMany(encounters.map(e => e.id))}
              title="Select all encounters"
            >
              All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-xs"
              onClick={() => onSelectMany(bossEncounters.map(e => e.id))}
              disabled={bossEncounters.length === 0}
              title="Select boss encounters only"
            >
              Bosses
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-xs"
              onClick={() => onSelectMany(trashEncounterIds)}
              disabled={trashEncounterIds.length === 0}
              title="Select trash encounters only"
            >
              Trash
            </Button>
          </div>
        </div>
        <div className="flex items-start gap-1 -mt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showChronological ? "default" : "ghost"}
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowChronological(!showChronological)}
                data-help-view-toggle
              >
                {showChronological ? (
                  <List className="h-4 w-4" />
                ) : (
                  <FolderTree className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showChronological ? "Showing chronologically" : "Showing grouped by type"}
            </TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mr-1"
            onClick={onCollapse}
            title="Hide sidebar"
            data-help-collapse-toggle
          >
            {isMobile ? <X className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      
      {/* Chronological view - all encounters sorted by time */}
      {showChronological ? (
        <div className="space-y-1">
          {chronologicalEncounters.map((encounter) => {
            const isSelected = selectedIds.includes(encounter.id);
            const isWipe = encounter.kill_type === "wipe";
            
            return (
              <div
                role="button"
                tabIndex={0}
                key={encounter.id}
                onClick={(e) => handleClick(encounter.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick(encounter.id, e);
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-all duration-150 cursor-pointer",
                  isSelected
                    ? "bg-primary-darker text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
                    : "hover:bg-accent/50 hover:translate-x-0.5",
                  isWipe && !isSelected && "opacity-60",
                  !encounter.boss && !isSelected && "text-muted-foreground"
                )}
              >
                {encounter.kill_type === "clean" ? (
                  <CheckCircle className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-green-500" : "text-green-500/60")} />
                ) : encounter.kill_type === "partial" ? (
                  <AlertTriangle className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-yellow-500" : "text-yellow-500/60")} />
                ) : (
                  <Skull className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-red-500" : "text-red-500/60")} />
                )}
                <span className="truncate flex-1">
                  {encounter.boss ? encounter.name : <span className="italic">{encounter.name}</span>}
                </span>
                <span className={cn("text-xs shrink-0", isSelected ? "opacity-70" : "text-muted-foreground")}>
                  {formatDuration(encounter.start_time, encounter.end_time)}
                </span>
                {isDebug && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyEncounterTimes(encounter.start_time, encounter.end_time);
                    }}
                    className="p-1 hover:bg-accent rounded"
                    title="Copy encounter times"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <>
      {/* Boss encounters */}
      <div className="space-y-1">
        {bossEncounters.map((encounter) => {
          const isSelected = selectedIds.includes(encounter.id);
          const isWipe = encounter.kill_type === "wipe";
          
          return (
            <div
              role="button"
              tabIndex={0}
              key={encounter.id}
              onClick={(e) => handleClick(encounter.id, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(encounter.id, e);
                }
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-all duration-150 cursor-pointer",
                isSelected
                  ? "bg-primary-darker text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
                  : "hover:bg-accent/50 hover:translate-x-0.5",
                isWipe && !isSelected && "opacity-60"
              )}
            >
              {encounter.kill_type === "clean" ? (
                <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
              ) : encounter.kill_type === "partial" ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
              ) : (
                <Skull className="h-4 w-4 shrink-0 text-red-500" />
              )}
              <span className="truncate flex-1">{encounter.name}</span>
              <span className={cn("text-xs shrink-0", isSelected ? "opacity-70" : "text-muted-foreground")}>
                {formatDuration(encounter.start_time, encounter.end_time)}
              </span>
              {isDebug && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyEncounterTimes(encounter.start_time, encounter.end_time);
                  }}
                  className="p-1 hover:bg-accent rounded"
                  title="Copy encounter times"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Trash section */}
      {totalTrash > 0 && (
        <Collapsible open={effectiveTrashOpen} onOpenChange={setTrashOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-muted opacity-60">
              {effectiveTrashOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span>Trash</span>
              <span className="text-muted-foreground">({totalTrash})</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-2 mt-1 space-y-1">
              {trashGroups.map((group) => {
                const expanded = isGroupExpanded(group.name);
                return (
                <Collapsible
                  key={group.name}
                  open={expanded}
                  onOpenChange={(open) => setManualExpandedGroup(open ? group.name : null)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-left hover:bg-muted opacity-70">
                      {expanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span className="truncate">{group.name}</span>
                      <span className="text-muted-foreground">
                        x{group.encounters.length}
                        {group.wipes > 0 && ` (${group.wipes}💀)`}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-4 space-y-0.5">
                      {group.encounters.map((encounter, idx) => {
                        const isSelected = selectedIds.includes(encounter.id);
                        return (
                          <div
                            role="button"
                            tabIndex={0}
                            key={encounter.id}
                            onClick={(e) => handleClick(encounter.id, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleClick(encounter.id, e);
                              }
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-all duration-150 cursor-pointer",
                              isSelected
                                ? "bg-primary-darker text-primary-foreground border-l-2 border-l-primary-foreground/70"
                                : "hover:bg-accent/50 hover:translate-x-0.5 opacity-60"
                            )}
                          >
                            {encounter.kill_type === "clean" ? (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            ) : encounter.kill_type === "partial" ? (
                              <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            ) : (
                              <Skull className="h-3 w-3 text-red-500" />
                            )}
                            <span className="flex-1">#{idx + 1}</span>
                            <span className={cn("shrink-0", isSelected ? "opacity-70" : "text-muted-foreground")}>
                              {formatDuration(encounter.start_time, encounter.end_time)}
                            </span>
                            {isDebug && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyEncounterTimes(encounter.start_time, encounter.end_time);
                                }}
                                className="p-1 hover:bg-accent rounded"
                                title="Copy encounter times"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      </>
      )}
    </div>
  );
}

const PANEL_ROW_HEIGHT_PX = 96;
const GRID_COLS = 12;

function orderLayoutItems(items: GridEditorItem[]): GridEditorItem[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

function normalizeLayoutItems(items: GridEditorItem[]): GridEditorItem[] {
  const normalized = items.map((item) => {
    const w = Math.max(4, Math.min(item.w, GRID_COLS));
    const h = Math.max(4, item.h);
    const x = Math.max(0, Math.min(item.x, GRID_COLS - w));
    const y = Math.max(0, item.y);
    return {
      ...item,
      x,
      y,
      w,
      h,
      minW: item.minW ?? 4,
      minH: item.minH ?? 4,
      maxW: item.maxW ?? GRID_COLS,
      maxH: item.maxH ?? 20,
    };
  });

  // simple collision resolution: push items down until free
  const occupied = new Set<string>();
  const out: GridEditorItem[] = [];

  for (const item of orderLayoutItems(normalized)) {
    let y = item.y;
    while (true) {
      let overlaps = false;
      for (let dx = 0; dx < item.w && !overlaps; dx++) {
        for (let dy = 0; dy < item.h; dy++) {
          if (occupied.has(`${item.x + dx}:${y + dy}`)) {
            overlaps = true;
            break;
          }
        }
      }
      if (!overlaps) break;
      y += 1;
    }

    for (let dx = 0; dx < item.w; dx++) {
      for (let dy = 0; dy < item.h; dy++) {
        occupied.add(`${item.x + dx}:${y + dy}`);
      }
    }

    out.push({ ...item, y });
  }

  return orderLayoutItems(out);
}

// ============================================================================
// EncounterDetail component
// ============================================================================

interface EncounterDetailProps {
  instance: Instance;
  encounters: Encounter[];
  players: Record<string, InstancePlayer>;
  entitySelection: EntitySelection;
  layoutItems: GridEditorItem[];
  panelTypesById: Record<string, EventsPanelType>;
  panelOptionsById: Record<string, string | null>;
  onPanelTypeChange: (itemID: string, type: EventsPanelType) => void;
  onPanelOptionChange: (itemID: string, option: string | null) => void;
  onToggleEnemy: (enemyId: string) => void;
  onSelectEnemies: (enemyIds: string[]) => void;
  onTogglePlayer: (playerId: string) => void;
  onTogglePlayers: (playerIds: string[]) => void;
  onClearSelection: () => void;
  onSelectEncounters: (encounterIds: string[]) => void;
  /** Callback when user clicks the explainer button on a panel */
  onExplainerClick: (panelType: EventsPanelType) => void;
  /** Whether to show helpful hints (tooltips, help icons) */
  showHints: boolean;
  isMobile: boolean;
}

function EncounterDetail({
  instance,
  encounters,
  players,
  entitySelection,
  layoutItems,
  panelTypesById,
  panelOptionsById,
  onPanelTypeChange,
  onPanelOptionChange,
  onToggleEnemy,
  onSelectEnemies,
  onTogglePlayer,
  onTogglePlayers,
  onClearSelection,
  onSelectEncounters,
  onExplainerClick,
  showHints,
  isMobile,
}: EncounterDetailProps) {
  const isSingle = encounters.length === 1;
  const encounter = encounters[0];

  // Active tab and collapsible state
  const [activeTab, setActiveTab] = useState<'enemies' | 'players'>('enemies');
  const [isEntityPanelOpen, setIsEntityPanelOpen] = useState(false);
  
  // Merge enemies across all selected encounters
  const mergedEnemies = mergeEnemies(encounters);
  
  const totalDurationMs = computeTotalDuration(encounters);
  
  // Compute elapsed time (from first encounter start to last encounter end)
  const elapsedTimeMs = useMemo(() => {
    if (encounters.length <= 1) return null;
    const startTimes = encounters.map(e => new Date(e.start_time).getTime());
    const endTimes = encounters.map(e => new Date(e.end_time).getTime());
    return Math.max(...endTimes) - Math.min(...startTimes);
  }, [encounters]);
  
  const selectedEncounterIDs = useMemo(() => encounters.map((e) => e.id), [encounters]);

  // Build PanelContext for EventsPanels
  const panelContext: PanelContext = useMemo(
    () => ({
      instance,
      selectedEncounterIds: selectedEncounterIDs,
      entitySelection,
      onSelectEncounters,
      onTogglePlayer,
      onTogglePlayers,
    }),
    [
      instance,
      selectedEncounterIDs,
      entitySelection,
      onSelectEncounters,
      onTogglePlayer,
      onTogglePlayers,
    ],
  );
  
  // Helper to check if an enemy is selected
  const isEnemySelected = (id: string) => entitySelection.enemyIds.has(id);
  
  // Helper to check if a player is selected
  const isPlayerSelected = (id: string) => entitySelection.playerIds.has(id);
  
  // Class display order (roughly by armor type / role)
  const CLASS_ORDER = [
    "WARRIOR", "ROGUE", "HUNTER", 
    "MAGE", "WARLOCK", 
    "PRIEST", "DRUID", "SHAMAN", "PALADIN",
    "UNKNOWN"
  ];
  
  // Build player list and group by class
  const playerList = Object.entries(players).map(([guid, player]) => ({
    guid,
    ...player,
  }));
  
  // Group players by class
  const playersByClass = useMemo(() => {
    const byClass = new Map<string, typeof playerList>();
    for (const player of playerList) {
      const cls = player.class.toUpperCase();
      if (!byClass.has(cls)) {
        byClass.set(cls, []);
      }
      byClass.get(cls)!.push(player);
    }
    // Sort players within each class alphabetically
    for (const players of byClass.values()) {
      players.sort((a, b) => a.name.localeCompare(b.name));
    }
    // Return classes in predefined order
    return CLASS_ORDER
      .filter(cls => byClass.has(cls))
      .map(cls => ({ className: cls, players: byClass.get(cls)! }));
  }, [playerList]);
  
  // Has any selection
  const hasSelection = entitySelection.enemyIds.size > 0 || entitySelection.playerIds.size > 0;
  
  // Selection counts for display
  const selectedEnemyCount = entitySelection.enemyIds.size;
  const selectedPlayerCount = entitySelection.playerIds.size;
  const totalSelectionCount = selectedEnemyCount + selectedPlayerCount;

  // Build title
  const title = isSingle
    ? encounter.name
    : `${encounters.length} Encounters Selected`;

  const subtitle = isSingle
    ? (encounter.kill_type === "wipe" ? "(Wipe)" : encounter.kill_type === "partial" ? "(Partial)" : null)
    : encounters.map(e => e.name).filter((v, i, a) => a.indexOf(v) === i).join(", ");

  return (
    <div className="flex-1 min-w-0">
      {/* Encounter header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {isSingle && (
            encounter.kill_type === "clean" ? (
              <CheckCircle className="h-6 w-6 text-green-500" />
            ) : encounter.kill_type === "partial" ? (
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
            ) : (
              <Skull className="h-6 w-6 text-red-500" />
            )
          )}
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate max-w-md">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground text-sm">
          {elapsedTimeMs !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>{formatDurationMs(elapsedTimeMs)}</span>
                  <span className="text-xs opacity-60">elapsed</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Total time from first encounter start to last encounter end
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>{formatDurationMs(totalDurationMs)}</span>
                {elapsedTimeMs !== null && <span className="text-xs opacity-60">combat</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {elapsedTimeMs !== null 
                ? "Sum of all encounter durations (active combat time)"
                : "Encounter duration"
              }
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Entity selection - Enemies and Players tabs */}
      <Tabs value={activeTab} onValueChange={(v) => {
        setActiveTab(v as 'enemies' | 'players');
        setIsEntityPanelOpen(true);
      }} className="mb-6">
        <Collapsible open={isEntityPanelOpen} onOpenChange={setIsEntityPanelOpen}>
          <Card className="p-4" data-help-entity-panel>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TabsList>
                  <TabsTrigger value="enemies" className="gap-1.5">
                    <Skull className="h-4 w-4" />
                    Enemies ({mergedEnemies.length})
                    {selectedEnemyCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                        {selectedEnemyCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="players" className="gap-1.5">
                    <Users className="h-4 w-4" />
                    Players ({playerList.length})
                    {selectedPlayerCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                        {selectedPlayerCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
                {showHints && (
                  <HintTooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground/50 hover:text-muted-foreground">
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span className="sr-only">Entity filtering tips</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <RandomTip id="entity-panel" tips={ENTITY_TIPS} />
                    </TooltipContent>
                  </HintTooltip>
                )}
                {hasSelection && (
                  <button
                    onClick={onClearSelection}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-destructive hover:text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    Clear ({totalSelectionCount})
                  </button>
                )}
              </div>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 -mr-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <span className="text-xs">
                    {mergedEnemies.length} enemies
                  </span>
                  <ChevronRight className="h-4 w-4 transition-transform duration-200 [[data-state=open]_&]:rotate-90" />
                </button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <div>
                <TabsContent value="enemies" className="mt-0">
                  {mergedEnemies.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      {mergedEnemies.some(e => e.boss) && (
                        <>
                          <button
                            onClick={() => onSelectEnemies(mergedEnemies.filter(e => e.boss).map(e => e.id))}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Select Bosses
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {mergedEnemies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No enemies in this encounter</p>
                    ) : (
                      mergedEnemies.map((enemy) => {
                        const isSelected = isEnemySelected(enemy.id);
                        return (
                          <HintTooltip key={enemy.id}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => onToggleEnemy(enemy.id)}
                                className={cn(
                                  "flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-all",
                                  enemy.killed
                                    ? "bg-green-500/15 border border-green-500/30"
                                    : "bg-red-500/15 border border-red-500/30",
                                  isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                  hasSelection && !isSelected && "opacity-50"
                                )}
                              >
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                  enemy.killed ? "bg-green-500" : "bg-red-500"
                                )} />
                                {enemy.boss && (
                                  <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                                )}
                                <span className="font-medium">{enemy.name}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" hideArrow className="p-3 bg-card text-card-foreground border border-border">
                              {formatPeriodsTooltip(enemy.id, enemy.periods)}
                            </TooltipContent>
                          </HintTooltip>
                        );
                      })
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="players" className="mt-0">
                  {playerList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No players in this instance</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-3 gap-y-2">
                      {playersByClass.map(({ className, players: classPlayers }) => (
                        <div key={className} className="flex items-center gap-1">
                          {showHints ? (
                            <HintTooltip>
                              <TooltipTrigger asChild>
                                <span 
                                  className="text-2xs font-medium cursor-pointer hover:underline"
                                  style={{ color: `var(--class-${className.toLowerCase()})` }}
                                  onClick={() => onTogglePlayers(classPlayers.map(p => p.guid))}
                                >
                                  {className.slice(0, 3)}:
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[180px]">
                                <RandomTip id={`class-${className}`} tips={CLASS_TOGGLE_TIPS} />
                              </TooltipContent>
                            </HintTooltip>
                          ) : (
                            <span 
                              className="text-2xs font-medium cursor-pointer hover:underline"
                              style={{ color: `var(--class-${className.toLowerCase()})` }}
                              onClick={() => onTogglePlayers(classPlayers.map(p => p.guid))}
                              title={`Toggle all ${className.toLowerCase()}s`}
                            >
                              {className.slice(0, 3)}:
                            </span>
                          )}
                          {classPlayers.map((player) => {
                            const isSelected = isPlayerSelected(player.guid);
                            return (
                              <Tooltip key={player.guid}>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => onTogglePlayer(player.guid)}
                                    className={cn(
                                      "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-all",
                                      "bg-muted/50 border border-border hover:bg-muted",
                                      isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                      hasSelection && !isSelected && "opacity-50"
                                    )}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: `var(--class-${player.class.toLowerCase()})` }}
                                    />
                                    <span
                                      className="font-medium"
                                      style={{ color: `var(--class-${player.class.toLowerCase()})` }}
                                    >
                                      {player.name}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <span className="font-mono text-xs">{player.guid}</span>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </Tabs>
      {/* Events Panels */}
      <PanelTimingProvider panelCount={layoutItems.length}>
        <PanelTimingResetter encounters={encounters} />

        <div
          className="grid gap-3 grid-cols-1 sm:grid-cols-12"
          style={{
            gridAutoRows: `${PANEL_ROW_HEIGHT_PX}px`,
          }}
        >
          {layoutItems.map((item, index) => {
            const panelType = panelTypesById[item.id] ?? "empty";
            return (
              <div
                key={item.id}
                className="min-h-0"
                style={{
                  gridColumn: isMobile ? "1 / -1" : `${item.x + 1} / span ${item.w}`,
                  gridRow: isMobile ? `auto / span ${item.h}` : `${item.y + 1} / span ${item.h}`,
                }}
              >
                <EventsPanel
                  panelType={panelType}
                  onPanelTypeChange={(nextType) => onPanelTypeChange(item.id, nextType)}
                  durationMs={totalDurationMs}
                  context={panelContext}
                  panelIndex={index}
                  onExplainerClick={onExplainerClick}
                  showHints={showHints}
                  panelOption={panelOptionsById[item.id] ?? null}
                  onPanelOptionChange={(nextOption) => onPanelOptionChange(item.id, nextOption)}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <PanelTimingDisplay />
        </div>
      </PanelTimingProvider>
    </div>
  );
}

// ============================================================================
// InstancePageView component (main export)
// ============================================================================

export interface InstancePageViewProps {
  instance: Instance;
  selectedEncounterIds?: string[];
  onSelectEncounters?: (encounterIds: string[]) => void;
  /** Optional button to show YouTube video overlay */
  youtubeButton?: React.ReactNode;
  /** URL to log detail page (shown only if user can manage the log, desktop only) */
  logDetailUrl?: string;
}

export function InstancePageView({
  instance,
  selectedEncounterIds: _selectedEncounterIds,
  onSelectEncounters,
  youtubeButton,
  logDetailUrl,
}: InstancePageViewProps) {
  // URL state for explainer mode (simple ?explain=panel_type)
  const [searchParams, setSearchParams] = useSearchParams();
  const explainerPanelType = searchParams.get("explain") as EventsPanelType | null;
  
  // URL state for help panel (?help=1)
  const helpOpen = searchParams.get("help") === "1";
  const setHelpOpen = useCallback((open: boolean) => {
    setSearchParams(prev => {
      if (open) {
        prev.set("help", "1");
      } else {
        prev.delete("help");
      }
      return prev;
    });
  }, [setSearchParams]);
  
  const handleExplainerClick = useCallback((panelType: EventsPanelType) => {
    setSearchParams(prev => {
      prev.set("explain", panelType);
      return prev;
    });
  }, [setSearchParams]);
  
  const handleExplainerExit = useCallback(() => {
    setSearchParams(prev => {
      prev.delete("explain");
      return prev;
    });
  }, [setSearchParams]);
  
  // Get user preference for showing helpful hints
  const showHints = useHelpfulHints();
  
  // Track first-time visit to highlight Help button
  const [hasSeenHelp, setHasSeenHelp] = useLocalStorage("instance-help-seen", false);
  
  // Dismiss highlight when help opens (via click or URL)
  useEffect(() => {
    if (helpOpen && !hasSeenHelp) {
      setHasSeenHelp(true);
    }
  }, [helpOpen, hasSeenHelp, setHasSeenHelp]);
  
  // Compute all enemies from all encounters (GUID-sorted for stable URL indexing)
  const allMergedEnemies = useMemo(
    () => mergeEnemiesByGuid(instance.encounters),
    [instance.encounters]
  );
  
  const standardOrderedLayoutItems = useMemo(
    () => orderLayoutItems(normalizeLayoutItems(DEFAULT_INSTANCE_LAYOUT_ITEMS)),
    [],
  );

  const alternateOrderedLayoutItems = useMemo(
    () => orderLayoutItems(normalizeLayoutItems(ALTERNATE_INSTANCE_LAYOUT_ITEMS)),
    [],
  );

  const defaultOrderedPanels = useMemo<PanelType[]>(
    () =>
      standardOrderedLayoutItems.map(
        (item) => (DEFAULT_INSTANCE_PANEL_TYPES[item.id] ?? "empty") as PanelType,
      ),
    [standardOrderedLayoutItems],
  );

  const [importedLayoutItems, setImportedLayoutItems] = useState<GridEditorItem[] | null>(null);

  // URL-persisted view state (base64 encoded single param)
  const {
    state: viewState,
    setEncounters: setUrlEncounterIds,
    setEnemies: setUrlEnemyIds,
    setPlayers: setUrlPlayerIds,
    setPanelType,
    setPanelOption,
    setPanels,
    setLayout,
    clearEntitySelection,
  } = useInstanceViewState({
    encounters: instance.encounters,
    enemies: allMergedEnemies,
    players: instance.players ?? {},
    defaults: {
      encounterIds: instance.encounters.map((e) => e.id),
      panels: defaultOrderedPanels,
    },
  });

  const baseOrderedLayoutItems = viewState.layout === "alternate"
    ? alternateOrderedLayoutItems
    : standardOrderedLayoutItems;

  const activeLayoutItems = useMemo(
    () => importedLayoutItems ?? baseOrderedLayoutItems,
    [importedLayoutItems, baseOrderedLayoutItems],
  );

  const panelTypesByID = useMemo<Record<string, EventsPanelType>>(() => {
    const next: Record<string, EventsPanelType> = {};
    activeLayoutItems.forEach((item, index) => {
      const urlType = viewState.panels[index];
      const defaultType = (DEFAULT_INSTANCE_PANEL_TYPES[item.id] ?? "empty") as EventsPanelType;
      const resolved = (urlType ?? defaultType) as EventsPanelType;
      next[item.id] = resolved in PANELS ? resolved : "empty";
    });
    return next;
  }, [activeLayoutItems, viewState.panels]);

  const panelOptionsByID = useMemo<Record<string, string | null>>(() => {
    const next: Record<string, string | null> = {};
    activeLayoutItems.forEach((item, index) => {
      next[item.id] = viewState.panelOptions[index] ?? null;
    });
    return next;
  }, [activeLayoutItems, viewState.panelOptions]);
  
  // Use URL state if present, otherwise default to all encounters
  const internalSelectedIds = useMemo(() => {
    if (viewState.encounters.length > 0) {
      // Filter to only valid encounter IDs
      const validIds = viewState.encounters.filter(id => 
        instance.encounters.some(e => e.id === id)
      );
      if (validIds.length > 0) return validIds;
    }
    // Default to all encounters when nothing is selected
    return instance.encounters.map(e => e.id);
  }, [viewState.encounters, instance.encounters]);
  
  const setInternalSelectedIds = useCallback((ids: string[]) => {
    setUrlEncounterIds(ids);
    onSelectEncounters?.(ids);
  }, [setUrlEncounterIds, onSelectEncounters]);
  
  // URL state is the source of truth on initial load.
  // Only sync when parent passes an explicit external selection (e.g. YouTube overlay).
  useEffect(() => {
    if (!_selectedEncounterIds?.length) {
      return;
    }

    const propsIds = _selectedEncounterIds;
    const isDifferent = propsIds.length !== internalSelectedIds.length || 
      propsIds.some(id => !internalSelectedIds.includes(id));
    if (isDifferent) {
      setUrlEncounterIds(propsIds);
    }
  }, [_selectedEncounterIds, internalSelectedIds, setUrlEncounterIds]);
  
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [hasSeenSelector, setHasSeenSelector] = useState(() => hasSeenEncounterSelector());
  
  // Handle encounter FAB click - mark as seen and toggle sidebar
  const handleEncounterButtonClick = () => {
    if (!hasSeenSelector) {
      markEncounterSelectorSeen();
      setHasSeenSelector(true);
    }
    setSidebarOpen(!sidebarOpen);
  };

  
  // Close sidebar when switching to mobile view
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);
  
  const entitySelection = useMemo<EntitySelection>(() => ({
    enemyIds: viewState.enemies,
    playerIds: viewState.players,
  }), [viewState.enemies, viewState.players]);
  
  // Toggle enemy selection
  const toggleEnemySelection = useCallback((enemyId: string) => {
    setUrlEnemyIds((prev) => {
      const next = new Set(prev);
      if (next.has(enemyId)) {
        next.delete(enemyId);
      } else {
        next.add(enemyId);
      }
      return next;
    });
  }, [setUrlEnemyIds]);
  
  // Select multiple enemies at once (replaces current selection)
  const selectEnemies = useCallback((enemyIds: string[]) => {
    setUrlEnemyIds(new Set(enemyIds));
  }, [setUrlEnemyIds]);
  
  // Toggle player selection
  const togglePlayerSelection = useCallback((playerId: string) => {
    setUrlPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }, [setUrlPlayerIds]);
  
  // Toggle multiple players at once (if any are selected, deselect all; otherwise select all)
  const togglePlayersSelection = useCallback((playerIds: string[]) => {
    setUrlPlayerIds((prev) => {
      const next = new Set(prev);
      const anySelected = playerIds.some((id) => next.has(id));
      if (anySelected) {
        // Deselect all
        for (const id of playerIds) {
          next.delete(id);
        }
      } else {
        // Select all
        for (const id of playerIds) {
          next.add(id);
        }
      }
      return next;
    });
  }, [setUrlPlayerIds]);

  // Use internalSelectedIds which already prioritizes URL state over props
  const selectedIds = internalSelectedIds;
  
  const handleSelect = (id: string, mode: 'single' | 'toggle') => {
    // Always use setInternalSelectedIds to update both URL and parent state
    if (mode === 'toggle') {
      // Toggle selection
      if (selectedIds.includes(id)) {
        // Don't allow deselecting the last one
        if (selectedIds.length > 1) {
          setInternalSelectedIds(selectedIds.filter(sid => sid !== id));
        }
      } else {
        setInternalSelectedIds([...selectedIds, id]);
      }
    } else {
      // Single select replaces
      setInternalSelectedIds([id]);
    }
  };

  const handlePanelTypeChangeByID = useCallback((itemID: string, type: EventsPanelType) => {
    const idx = activeLayoutItems.findIndex((item) => item.id === itemID);
    if (idx === -1) return;
    setPanelType(idx, type as PanelType);
  }, [activeLayoutItems, setPanelType]);

  const handlePanelOptionChangeByID = useCallback((itemID: string, option: string | null) => {
    const idx = activeLayoutItems.findIndex((item) => item.id === itemID);
    if (idx === -1) return;
    setPanelOption(idx, option);
  }, [activeLayoutItems, setPanelOption]);

  const handleImportLayout = useCallback(() => {
    const raw = window.prompt("Paste exported layout JSON");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        version?: number;
        items?: GridEditorItem[];
        panelTypesById?: Record<string, EventsPanelType>;
      };

      if (parsed.version !== 1) {
        throw new Error("Unsupported layout version");
      }
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
        throw new Error("Missing items");
      }
      if (!parsed.panelTypesById || typeof parsed.panelTypesById !== "object") {
        throw new Error("Missing panelTypesById");
      }

      const normalizedItems = normalizeLayoutItems(parsed.items);
      const importedTypes: Record<string, EventsPanelType> = {};
      normalizedItems.forEach((item) => {
        const candidate = parsed.panelTypesById?.[item.id] ?? "empty";
        importedTypes[item.id] = candidate in PANELS ? candidate : "empty";
      });

      const orderedItems = orderLayoutItems(normalizedItems);
      const orderedPanels = orderedItems.map((item) => (importedTypes[item.id] ?? "empty") as PanelType);
      setPanels(orderedPanels, orderedPanels.map(() => null));

      setImportedLayoutItems(orderedItems);

      toast.success("Imported layout", { description: `Applied ${orderedItems.length} panel${orderedItems.length === 1 ? "" : "s"}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid layout JSON";
      toast.error("Import failed", { description: message });
    }
  }, [setPanels]);

  const selectedEncounters = instance.encounters.filter((e) => selectedIds.includes(e.id));
  const trashGroups = groupTrashEncounters(instance.encounters);

  const totalDuration = instance.endTime
    ? formatDuration(instance.startTime, instance.endTime)
    : null;
    
  // Compute total duration for explainer view
  const totalDurationMs = useMemo(() => {
    return selectedEncounters.reduce((acc, enc) => {
      const start = new Date(enc.start_time).getTime();
      const end = new Date(enc.end_time).getTime();
      return acc + (end - start);
    }, 0);
  }, [selectedEncounters]);
  
  // Build panel context for explainer view
  const explainerPanelContext: PanelContext = useMemo(() => ({
    instance,
    selectedEncounterIds: selectedEncounters.map(e => e.id),
    entitySelection: {
      enemyIds: viewState.enemies,
      playerIds: viewState.players,
    },
    onSelectEncounters: setInternalSelectedIds,
    onTogglePlayer: togglePlayerSelection,
    onTogglePlayers: togglePlayersSelection,
  }), [instance, selectedEncounters, viewState.enemies, viewState.players, setInternalSelectedIds, togglePlayerSelection, togglePlayersSelection]);
  
  // If explainer mode is active on desktop, show only the explainer view
  if (explainerPanelType && !isMobile) {
    return (
      <PanelExplainerView
        panelType={explainerPanelType}
        context={explainerPanelContext}
        durationMs={totalDurationMs}
        onExit={handleExplainerExit}
      />
    );
  }

  return (
    <div className={cn(
      "w-full py-6",
      // Mobile: minimal padding, full width
      isMobile ? "px-2" : "px-4"
    )}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{instance.name}</h1>
            <p className="text-muted-foreground text-sm">
              {instance.guild && (
                <span className="text-amber-500">&lt;{instance.guild.name}&gt;</span>
              )}
              {instance.guild && instance.realm && " • "}
              {instance.realm && `${instance.realm}`}
              {(instance.guild || instance.realm) && " • "}
              {formatTime(instance.startTime)}
              {totalDuration && ` • ${totalDuration}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {youtubeButton}
            {showHints && !isMobile && (
              <>
                <div className="relative">
                  <Button
                    variant={hasSeenHelp ? "ghost" : "default"}
                    size="sm"
                    className={cn(
                      "gap-1.5",
                      !hasSeenHelp && "animate-bounce shadow-lg shadow-primary/25"
                    )}
                    onClick={() => setHelpOpen(true)}
                  >
                    <HelpCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">Help</span>
                    {!hasSeenHelp && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                      </span>
                    )}
                  </Button>
                </div>
                <InstanceHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
              </>
            )}
            {/* Hamburger menu with layout options + view log */}
            <InstanceMenu
              layout={viewState.layout}
              onLayoutChange={setLayout}
              onImportLayout={handleImportLayout}
              instanceId={instance.id}
              logDetailUrl={logDetailUrl}
            />
          </div>
        </div>
      </div>

      {/* Main content: sidebar + detail */}
      <div className="flex gap-6 relative">
        {/* Mobile backdrop */}
        {isMobile && sidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {sidebarOpen && (
          <EncounterSidebar
            onCollapse={() => setSidebarOpen(false)}
            encounters={instance.encounters}
            trashGroups={trashGroups}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onSelectMany={(ids) => {
              setInternalSelectedIds(ids);
            }}
            isMobile={isMobile}
            showHints={showHints}
          />
        )}
        
        {/* Desktop: inline toggle when sidebar closed */}
        {!sidebarOpen && !isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="shrink-0"
            title="Show sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
        
        {selectedEncounters.length > 0 ? (
          <EncounterDetail
            instance={instance}
            encounters={selectedEncounters}
            players={instance.players ?? {}}
            entitySelection={entitySelection}
            layoutItems={activeLayoutItems}
            panelTypesById={panelTypesByID}
            panelOptionsById={panelOptionsByID}
            onPanelTypeChange={handlePanelTypeChangeByID}
            onPanelOptionChange={handlePanelOptionChangeByID}
            onToggleEnemy={toggleEnemySelection}
            onSelectEnemies={selectEnemies}
            onTogglePlayer={togglePlayerSelection}
            onTogglePlayers={togglePlayersSelection}
            onClearSelection={clearEntitySelection}
            onSelectEncounters={setInternalSelectedIds}
            onExplainerClick={handleExplainerClick}
            showHints={showHints}
            isMobile={isMobile}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Select an encounter to view details</p>
          </div>
        )}
      </div>

      {/* Mobile: FAB toggle button - portaled to body to avoid fixed positioning issues */}
      {isMobile && createPortal(
        <Button
          variant="default"
          size="icon"
          onClick={handleEncounterButtonClick}
          className={cn(
            "fixed bottom-8 left-8 z-50 h-14 w-14 rounded-full",
            !hasSeenSelector && !sidebarOpen ? "animate-pulse-ring" : "shadow-lg"
          )}
          title={sidebarOpen ? "Close encounters" : "Show encounters"}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
        </Button>,
        document.body
      )}
    </div>
  );
}
