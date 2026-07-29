import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, Link } from "react-router-dom";
import { useSession, useCreateShare, fetchSharedView, type UserPanelLayout } from "@/api/queries";
import { Skull, CheckCircle, AlertTriangle, ChevronDown, ChevronRight, Clock, PanelLeftClose, PanelLeft, Users, Crown, List, FolderTree, X, HelpCircle, Copy, Share2, BookOpen, ExternalLink, Hourglass, ClockArrowUp, ClockArrowDown, RotateCcw } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useHelpfulHints } from "@/hooks/useHelpfulHints";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useInstanceDefaultsCache } from "@/hooks/useInstanceDefaultsCache";
import { type LayoutType, type PanelType } from "@/hooks/useUrlState";
import { useTimeRangeContextOptional } from "./TimeRangeContext";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { ActionBarSlotsResponse, ActivityPeriod, InstancePlayer } from "@/api/typesGenerated";
import { PeriodMomentDisplay } from "@/components/PeriodMomentDisplay";
import { Card } from "@/components/ui/Card/Card";
import { PortalContainerProvider } from "@/components/ui/PortalContainerContext";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/Collapsible/Collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, HintTooltip } from "@/components/ui/Tooltip/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { cn } from "@/lib/utils";
import type { Instance, Encounter, EnemyUnit } from "./InstancePage";
import { EventsPanel, type EventsPanelType, type PanelContext, type EntitySelection } from "./EventsPanels";
import type { PanelFilter } from "./EventsPanels/processors/filters";
import { PANELS } from "./EventsPanels/EventsPanel";
import { PanelTimingProvider, PanelTimingDisplay, PanelTimingResetter } from "./EventsPanels/PanelTimingContext";
import { ChartDataRegistryProvider } from "./EventsPanels/ChartDataRegistry";
import { PanelExplainerView } from "./PanelExplainer";
import { RandomTip } from "@/components/RandomTip";
import { InstanceActionBar } from "@/components/InstanceActionBar/InstanceActionBar";
import { InstanceHelpSheet } from "@/components/HelpSheet";
import { ENCOUNTER_TIPS, ENTITY_TIPS, CLASS_TOGGLE_TIPS } from "@/constants/tips";
import { InstanceMenu } from "./InstanceMenu";

import { HeroicBadge } from "@/components/HeroicBadge";
import { isHeroic } from "@/lib/wowUtils";
import { DuplicatesBadge } from "./DuplicatesBadge";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { formatClassLabel, formatRaceLabel } from "../ArmoryPage/CharacterHeader";
import { LAYOUT_ACTION_BAR_KEYS, type LayoutActionBarSlots } from "@/features/layoutBook/layoutBookStore";
import { parsePanelLayout } from "@/features/layoutBook/parseLayout";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  ALTERNATE_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
  DEFAULT_INSTANCE_PANEL_OPTIONS,
  DEFAULT_INSTANCE_PANEL_FILTERS,
} from "./viewDefaults";
import { PRESET_LAYOUTS, PRESET_LAYOUTS_BY_ID, DEFAULT_PRESET_ID } from "./presetLayouts";
import { openLayoutPopup, syncPopupAppearance, type LayoutPopup } from "./EventsPanels/panelPopup";

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

function toLayoutActionBarSlots(slots: ActionBarSlotsResponse | null | undefined): LayoutActionBarSlots {
  return Object.fromEntries(
    LAYOUT_ACTION_BAR_KEYS.map((key) => [key, slots?.[`slot_${key}`] ?? null]),
  ) as LayoutActionBarSlots;
}

type LocalInstanceViewState = {
  encounters: string[];
  enemies: Set<string>;
  players: Set<string>;
  panels: PanelType[];
  panelOptions: Array<string | null>;
  layout: LayoutType;
  includeWipes: boolean;
};

const LEGACY_PANEL_CODE_TO_TYPE: Record<string, PanelType> = {
  dd: "damage_done",
  ve: "vulnerability_effect",
  edd: "enemy_damage_done",
  pdd: "pet_damage_done",
  ff: "damage_done_friendly_fire",
  dt: "damage_taken",
  edt: "enemy_damage_taken",
  hd: "healing_done",
  ht: "healing_taken",
  xa: "extra_attacks",
  d: "deaths",
  dl: "death_log",
  mit: "mitigation",
  rr: "resource_regen",
  r: "roles",
  aa: "all_activity",
  e: "empty",
  inn: "innervate",
  sun: "sunder",
  jdg: "judgement",
  au: "aura_uptime",
  met: "metrics",
  per: "periods",
};

function parseLegacyPanelCode(encoded: string): { code: string; option: string | null } {
  const bracketIdx = encoded.indexOf("[");
  if (bracketIdx === -1) {
    return { code: encoded, option: null };
  }

  const code = encoded.slice(0, bracketIdx);
  const closeBracket = encoded.indexOf("]", bracketIdx);
  const option = closeBracket > bracketIdx
    ? encoded.slice(bracketIdx + 1, closeBracket)
    : encoded.slice(bracketIdx + 1);

  return { code, option: option || null };
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

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return formatDurationMs(end.getTime() - start.getTime());
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
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}hr ${minutes}m ${seconds.toString().padStart(2, "0")}s`;
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
    kills: encs.filter((e) => e.kill_type !== "wipe" && e.kill_type !== "reset").length,
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
// Enemy status helpers (killed / reset / alive)
// ============================================================================

type EnemyStatus = "killed" | "reset" | "alive";

function getEnemyStatus(enemy: MergedEnemy): EnemyStatus {
  const lastPeriod = enemy.periods[enemy.periods.length - 1];
  if (lastPeriod?.end_state === "reset") return "reset";
  if (enemy.killed) return "killed";
  return "alive";
}

function getGroupStatus(enemies: MergedEnemy[]): EnemyStatus {
  const statuses = enemies.map(getEnemyStatus);
  if (statuses.every(s => s === "killed")) return "killed";
  if (statuses.some(s => s === "reset") && statuses.every(s => s !== "alive")) return "reset";
  return "alive";
}

const statusColors = {
  killed: { bg: "bg-green-500/15", border: "border-green-500/30", dot: "bg-green-500", bgLight: "bg-green-500/10", borderLight: "border-green-500/20" },
  reset:  { bg: "bg-yellow-500/15", border: "border-yellow-500/30", dot: "bg-yellow-500", bgLight: "bg-yellow-500/10", borderLight: "border-yellow-500/20" },
  alive:  { bg: "bg-red-500/15", border: "border-red-500/30", dot: "bg-red-500", bgLight: "bg-red-500/10", borderLight: "border-red-500/20" },
} as const;

// ============================================================================
type EncounterTimeDisplay = "duration" | "start_time" | "end_time";

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
  includeWipes,
  onIncludeWipesChange,
  instanceStartTime,
}: {
  encounters: Encounter[];
  trashGroups: TrashGroup[];
  selectedIds: string[];
  onSelect: (id: string, mode: 'single' | 'toggle') => void;
  onSelectMany: (ids: string[]) => void;
  onCollapse: () => void;
  isMobile: boolean;
  showHints: boolean;
  includeWipes: boolean;
  onIncludeWipesChange: (value: boolean) => void;
  instanceStartTime: string;
}) {
  const nonWipeFilter = (e: Encounter) => {
    return includeWipes || (e.kill_type !== "wipe" && e.kill_type !== "reset");
  };
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
  const [timeDisplay, setTimeDisplay] = useState<EncounterTimeDisplay>("duration");
  const instanceStartMs = useMemo(() => new Date(instanceStartTime).getTime(), [instanceStartTime]);
  const formatEncounterTime = useCallback((encounter: Encounter) => {
    if (timeDisplay === "start_time") return formatTimestamp(new Date(encounter.start_time).getTime() - instanceStartMs);
    if (timeDisplay === "end_time") return formatTimestamp(new Date(encounter.end_time).getTime() - instanceStartMs);
    return formatDuration(encounter.start_time, encounter.end_time);
  }, [timeDisplay, instanceStartMs]);
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
            {!isMobile && showHints && (
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
              onClick={() => onSelectMany(encounters.filter(nonWipeFilter).map(e => e.id))}
              title="Select all encounters"
            >
              All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-xs"
              onClick={() => onSelectMany(bossEncounters.filter(nonWipeFilter).map(e => e.id))}
              disabled={bossEncounters.length === 0}
              title="Select boss encounters only"
            >
              Bosses
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-xs"
              onClick={() => onSelectMany(trashGroups.flatMap(g => g.encounters.filter(nonWipeFilter).map(e => e.id)))}
              disabled={trashEncounterIds.length === 0}
              title="Select trash encounters only"
            >
              Trash
            </Button>
          </div>
          <label className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={includeWipes}
              onCheckedChange={(checked) => onIncludeWipesChange(checked === true)}
              className="size-3.5"
            />
            Include wipes
          </label>
        </div>
        <div className="flex items-start gap-1 -mt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={timeDisplay === "duration" ? "Showing duration" : timeDisplay === "start_time" ? "Showing start time" : "Showing end time"}
              >
                {timeDisplay === "duration"
                  ? <Hourglass className="h-3.5 w-3.5" />
                  : timeDisplay === "start_time"
                    ? <ClockArrowUp className="h-3.5 w-3.5" />
                    : <ClockArrowDown className="h-3.5 w-3.5" />
                }
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className={cn(timeDisplay === "duration" && "font-semibold")}
                onClick={() => setTimeDisplay("duration")}
              >
                Duration
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(timeDisplay === "start_time" && "font-semibold")}
                onClick={() => setTimeDisplay("start_time")}
              >
                Start time
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(timeDisplay === "end_time" && "font-semibold")}
                onClick={() => setTimeDisplay("end_time")}
              >
                End time
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            const isWipeOrReset = encounter.kill_type === "wipe" || encounter.kill_type === "reset";
            
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
                  isWipeOrReset && !isSelected && "opacity-60",
                  !encounter.boss && !isSelected && "text-muted-foreground"
                )}
              >
                {encounter.kill_type === "clean" ? (
                  <CheckCircle className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-green-500" : "text-green-500/60")} />
                ) : encounter.kill_type === "partial" ? (
                  <AlertTriangle className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-yellow-500" : "text-yellow-500/60")} />
                ) : encounter.kill_type === "reset" ? (
                  <RotateCcw className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-orange-500" : "text-orange-500/60")} />
                ) : (
                  <Skull className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-red-500" : "text-red-500/60")} />
                )}
                <span className="truncate flex-1">
                  {encounter.boss ? encounter.name : <span className="italic">{encounter.name}</span>}
                </span>
                <span className={cn("text-xs shrink-0 font-mono", isSelected ? "opacity-70" : "text-muted-foreground")}>
                  {formatEncounterTime(encounter)}
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
          const isWipeOrReset = encounter.kill_type === "wipe" || encounter.kill_type === "reset";
          
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
                isWipeOrReset && !isSelected && "opacity-60"
              )}
            >
              {encounter.kill_type === "clean" ? (
                <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
              ) : encounter.kill_type === "partial" ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
              ) : encounter.kill_type === "reset" ? (
                <RotateCcw className="h-4 w-4 shrink-0 text-orange-500" />
              ) : (
                <Skull className="h-4 w-4 shrink-0 text-red-500" />
              )}
              <span className="truncate flex-1">{encounter.name}</span>
              <span className={cn("text-xs shrink-0 font-mono", isSelected ? "opacity-70" : "text-muted-foreground")}>
                {formatEncounterTime(encounter)}
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
                            ) : encounter.kill_type === "reset" ? (
                              <RotateCcw className="h-3 w-3 text-orange-500" />
                            ) : (
                              <Skull className="h-3 w-3 text-red-500" />
                            )}
                            <span className="flex-1">#{idx + 1}</span>
                            <span className={cn("shrink-0 font-mono", isSelected ? "opacity-70" : "text-muted-foreground")}>
                              {formatEncounterTime(encounter)}
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


interface SharedViewPayload {
  version: number;
  instanceId?: string;
  instance_id?: string;
  layoutId?: string;
  layout?: {
    items?: GridEditorItem[];
    panelTypesById?: Record<string, EventsPanelType>;
  };
  // Legacy v1 compatibility (flattened fields)
  items?: GridEditorItem[];
  panelTypesById?: Record<string, EventsPanelType>;
  view?: {
    encounters: string;
    enemies?: number[];
    players?: number[];
    panelOptions?: Record<string, unknown>;
    panelFilters?: Record<string, PanelFilter[]>;
    includeWipes?: boolean;
    /** Time range selection in ms offsets from encounter start. */
    timeRange?: { startMs: number; endMs: number };
  };
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

interface LayoutSnapshot {
  layoutItems: GridEditorItem[];
  panelTypesById: Record<string, EventsPanelType>;
  panelOptionsById: Record<string, string | null>;
  panelFiltersById: Record<string, PanelFilter[]>;
  activePresetId: string | null;
}

interface LayoutPopupSession extends LayoutPopup {
  sessionId: number;
  snapshot: LayoutSnapshot;
}

interface EventsPanelGridProps {
  layoutItems: GridEditorItem[];
  panelTypesById: Record<string, EventsPanelType>;
  panelOptionsById: Record<string, string | null>;
  seedFiltersByID: Record<string, PanelFilter[]>;
  seedFiltersVersion: number;
  durationMs: number;
  context: PanelContext;
  showHints: boolean;
  isMobile: boolean;
  onPanelTypeChange: (itemID: string, type: EventsPanelType) => void;
  onPanelOptionChange: (itemID: string, option: string | null) => void;
  onPanelFiltersChange: (itemID: string, filters: PanelFilter[]) => void;
  onExplainerClick: (panelType: EventsPanelType) => void;
}

function EventsPanelGrid({
  layoutItems,
  panelTypesById,
  panelOptionsById,
  seedFiltersByID,
  seedFiltersVersion,
  durationMs,
  context,
  showHints,
  isMobile,
  onPanelTypeChange,
  onPanelOptionChange,
  onPanelFiltersChange,
  onExplainerClick,
}: EventsPanelGridProps) {
  return (
    <div
      className="grid gap-3 grid-cols-1 sm:grid-cols-12"
      style={{ gridAutoRows: `${PANEL_ROW_HEIGHT_PX}px` }}
    >
      {layoutItems.map((item, index) => {
        const panelType = panelTypesById[item.id] ?? "empty";
        return (
          <div
            key={item.id}
            className="min-h-0"
            style={{
              gridColumn: isMobile ? "1 / -1" : `${item.x + 1} / span ${item.w}`,
              gridRow: isMobile
                ? `auto / span ${panelType === "timeline" && context.selectedEncounterIds.length > 1 ? 1 : item.h}`
                : `${item.y + 1} / span ${item.h}`,
            }}
          >
            <EventsPanel
              panelType={panelType}
              onPanelTypeChange={(nextType) => onPanelTypeChange(item.id, nextType)}
              durationMs={durationMs}
              context={context}
              panelIndex={index}
              panelId={item.id}
              onExplainerClick={onExplainerClick}
              showHints={showHints}
              panelOption={panelOptionsById[item.id] ?? null}
              onPanelOptionChange={(nextOption) => onPanelOptionChange(item.id, nextOption)}
              seedFilters={seedFiltersByID[item.id]}
              seedFiltersVersion={seedFiltersVersion}
              onFiltersChange={(filters) => onPanelFiltersChange(item.id, filters)}
            />
          </div>
        );
      })}
    </div>
  );
}

interface PoppedOutLayoutContentProps {
  session: LayoutPopupSession;
  durationMs: number;
  context: PanelContext;
  showHints: boolean;
  actionBarSlots: LayoutActionBarSlots;
  layouts: readonly UserPanelLayout[];
  onExplainerClick: (panelType: EventsPanelType) => void;
}

function PoppedOutLayoutContent({
  session,
  durationMs,
  context,
  showHints,
  actionBarSlots,
  layouts,
  onExplainerClick,
}: PoppedOutLayoutContentProps) {
  const [layoutItems, setLayoutItems] = useState(() => session.snapshot.layoutItems);
  const [panelTypesById, setPanelTypesById] = useState(() => session.snapshot.panelTypesById);
  const [panelOptionsById, setPanelOptionsById] = useState(() => session.snapshot.panelOptionsById);
  const [seedFiltersById, setSeedFiltersById] = useState(() => session.snapshot.panelFiltersById);
  const [seedFiltersVersion, setSeedFiltersVersion] = useState(1);
  const [activePresetId, setActivePresetId] = useState(session.snapshot.activePresetId);


  const applyPreset = useCallback((presetId: string) => {
    const preset = PRESET_LAYOUTS_BY_ID[presetId];
    if (!preset) return;

    const items = orderLayoutItems(normalizeLayoutItems(preset.layoutItems));
    setLayoutItems(items);
    setPanelTypesById(Object.fromEntries(
      items.map((item) => [item.id, preset.panelTypes[item.id] ?? "empty"]),
    ));
    setPanelOptionsById(Object.fromEntries(
      items.map((item) => [item.id, preset.panelOptions[item.id] ?? null]),
    ));
    setSeedFiltersById({ ...preset.panelFilters });
    setSeedFiltersVersion((version) => version + 1);
    setActivePresetId(presetId);
  }, []);

  const castLayout = useCallback((layout: UserPanelLayout) => {
    try {
      const parsed = parsePanelLayout(layout);
      const items = orderLayoutItems(normalizeLayoutItems(parsed.items));
      setLayoutItems(items);
      setPanelTypesById(Object.fromEntries(
        items.map((item) => {
          const candidate = parsed.panelTypesById[item.id] ?? "empty";
          return [item.id, candidate in PANELS ? candidate : "empty"];
        }),
      ));
      setPanelOptionsById(Object.fromEntries(
        items.map((item) => [item.id, parsed.panelOptionsById?.[item.id] ?? null]),
      ));
      const filters = parsed.panelFiltersById ?? {};
      setSeedFiltersById({ ...filters });
      setSeedFiltersVersion((version) => version + 1);
      setActivePresetId(null);
      toast.success("Cast layout", { description: layout.title });
    } catch {
      toast.error("Failed to cast layout", { description: "Layout payload is invalid." });
    }
  }, []);

  const layoutsById = useMemo(
    () => new Map(layouts.map((layout) => [layout.id, layout])),
    [layouts],
  );

  useEffect(() => {
    const popupWindow = session.window;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key < "0" || event.key > "9") return;

      const layoutId = actionBarSlots[event.key as keyof LayoutActionBarSlots];
      const layout = layoutId ? layoutsById.get(layoutId) : null;
      if (!layout) return;

      event.preventDefault();
      castLayout(layout);
    };

    popupWindow.addEventListener("keydown", handleKeyDown);
    return () => popupWindow.removeEventListener("keydown", handleKeyDown);
  }, [actionBarSlots, castLayout, layoutsById, session.window]);

  const handlePanelTypeChange = useCallback((itemID: string, type: EventsPanelType) => {
    setPanelTypesById((previous) => ({ ...previous, [itemID]: type }));
    setPanelOptionsById((previous) => ({ ...previous, [itemID]: null }));
    const defaults = PANELS[type]?.defaultFilters ?? [];
    setSeedFiltersById((previous) => ({ ...previous, [itemID]: defaults }));
    setSeedFiltersVersion((version) => version + 1);
    setActivePresetId(null);
  }, []);

  const handlePanelOptionChange = useCallback((itemID: string, option: string | null) => {
    setPanelOptionsById((previous) => ({ ...previous, [itemID]: option }));
    setActivePresetId(null);
  }, []);

  const handlePanelFiltersChange = useCallback(() => {
    setActivePresetId(null);
  }, []);

  return (
    <PortalContainerProvider container={session.container}>
      <div className="min-h-screen bg-background text-foreground p-3">
        <div className="sticky top-0 z-40 mb-3 border-b border-border bg-background/95 pb-2 pt-1 backdrop-blur">
          <div className="flex gap-1 overflow-x-auto styled-scrollbar">
            {PRESET_LAYOUTS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors",
                  activePresetId === preset.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <PanelTimingProvider panelCount={layoutItems.length}>
          <ChartDataRegistryProvider>
            <EventsPanelGrid
              layoutItems={layoutItems}
              panelTypesById={panelTypesById}
              panelOptionsById={panelOptionsById}
              seedFiltersByID={seedFiltersById}
              seedFiltersVersion={seedFiltersVersion}
              durationMs={durationMs}
              context={context}
              showHints={showHints}
              isMobile={false}
              onPanelTypeChange={handlePanelTypeChange}
              onPanelOptionChange={handlePanelOptionChange}
              onPanelFiltersChange={handlePanelFiltersChange}
              onExplainerClick={onExplainerClick}
            />
          </ChartDataRegistryProvider>
        </PanelTimingProvider>
      </div>
    </PortalContainerProvider>
  );
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
  seedFiltersByID: Record<string, PanelFilter[]>;
  seedFiltersVersion: number;
  onPanelTypeChange: (itemID: string, type: EventsPanelType) => void;
  onPanelOptionChange: (itemID: string, option: string | null) => void;
  onPanelFiltersChange: (itemID: string, filters: PanelFilter[]) => void;
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
  /** Currently active preset ID (null if custom layout) */
  activePresetId: string | null;
  /** Callback when user clicks a preset tab */
  onPresetChange: (presetId: string) => void;
  /** Popup hosting the complete panel grid, when the layout is popped out. */
  layoutPopup: LayoutPopupSession | null;
  actionBarSlots: LayoutActionBarSlots;
  layouts: readonly UserPanelLayout[];
}

function EncounterDetail({
  instance,
  encounters,
  players,
  entitySelection,
  layoutItems,
  panelTypesById,
  panelOptionsById,
  seedFiltersByID,
  seedFiltersVersion,
  onPanelTypeChange,
  onPanelOptionChange,
  onPanelFiltersChange,
  onToggleEnemy,
  onSelectEnemies,
  onTogglePlayer,
  onTogglePlayers,
  onClearSelection,
  onSelectEncounters,
  onExplainerClick,
  showHints,
  isMobile,
  activePresetId,
  onPresetChange,
  layoutPopup,
  actionBarSlots,
  layouts,
}: EncounterDetailProps) {
  const isSingle = encounters.length === 1;
  const encounter = encounters[0];

  // Active tab and collapsible state
  const [activeTab, setActiveTab] = useState<'enemies' | 'players'>('enemies');
  const [isEntityPanelOpen, setIsEntityPanelOpen] = useState(false);
  // Merge enemies across all selected encounters
  const mergedEnemies = mergeEnemies(encounters);

  // Group enemies by name for compact display
  interface EnemyGroup {
    name: string;
    boss: boolean;
    killed: boolean;
    totalDamageTaken: number;
    enemies: MergedEnemy[];
  }

  const enemyGroups = useMemo((): EnemyGroup[] => {
    const groupMap = new Map<string, EnemyGroup>();
    for (const enemy of mergedEnemies) {
      const existing = groupMap.get(enemy.name);
      if (existing) {
        existing.enemies.push(enemy);
        existing.totalDamageTaken += enemy.damageTaken;
        existing.killed = existing.killed && enemy.killed;
        existing.boss = existing.boss || enemy.boss;
      } else {
        groupMap.set(enemy.name, {
          name: enemy.name,
          boss: enemy.boss,
          killed: enemy.killed,
          totalDamageTaken: enemy.damageTaken,
          enemies: [enemy],
        });
      }
    }
    return Array.from(groupMap.values()).sort((a, b) => {
      // Bosses first, then by damage taken
      if (a.boss !== b.boss) return a.boss ? -1 : 1;
      return b.totalDamageTaken - a.totalDamageTaken;
    });
  }, [mergedEnemies]);

  const toggleEnemyGroup = useCallback((groupEnemyIds: string[]) => {
    const currentEnemies = entitySelection.enemyIds;
    const allSelected = groupEnemyIds.every(id => currentEnemies.has(id));
    if (allSelected) {
      // Remove all group members from selection
      const next = new Set(currentEnemies);
      for (const id of groupEnemyIds) next.delete(id);
      onSelectEnemies(Array.from(next));
    } else {
      // Add all group members to selection
      const next = new Set(currentEnemies);
      for (const id of groupEnemyIds) next.add(id);
      onSelectEnemies(Array.from(next));
    }
  }, [entitySelection.enemyIds, onSelectEnemies]);


  
  const totalDurationMs = computeTotalDuration(encounters);
  
  // Compute elapsed time (from first encounter start to last encounter end)
  const elapsedTimeMs = useMemo(() => {
    if (encounters.length <= 1) return null;
    const startTimes = encounters.map(e => new Date(e.start_time).getTime());
    const endTimes = encounters.map(e => new Date(e.end_time).getTime());
    return Math.max(...endTimes) - Math.min(...startTimes);
  }, [encounters]);
  
  const selectedEncounterIDs = useMemo(() => encounters.map((e) => e.id), [encounters]);

  // Defer entity selection for panels so the chip UI updates immediately
  const deferredEntitySelection = useDeferredValue(entitySelection);

  // Build PanelContext for EventsPanels (uses deferred selection)
  const panelContext: PanelContext = useMemo(
    () => ({
      instance,
      selectedEncounterIds: selectedEncounterIDs,
      entitySelection: deferredEntitySelection,
      onSelectEncounters,
      onTogglePlayer,
      onTogglePlayers,
    }),
    [
      instance,
      selectedEncounterIDs,
      deferredEntitySelection,
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
    "MAGE", "WARLOCK", "DEATHKNIGHT", 
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
    ? (encounter.kill_type === "wipe" ? "(Wipe)" : encounter.kill_type === "partial" ? "(Partial)" : encounter.kill_type === "reset" ? "(Reset)" : null)
    : encounters.map(e => e.name).filter((v, i, a) => a.indexOf(v) === i).join(", ");

  return (
    <div className="flex-1 min-w-0">
      {/* Encounter header */}
      <div className={cn("mb-6", "flex items-center justify-between")}>
        <div className="flex items-center gap-3">
          {isSingle && (
            encounter.kill_type === "clean" ? (
              <CheckCircle className="h-6 w-6 text-green-500" />
            ) : encounter.kill_type === "partial" ? (
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
            ) : encounter.kill_type === "reset" ? (
              <RotateCcw className="h-6 w-6 text-orange-500" />
            ) : (
              <Skull className="h-6 w-6 text-red-500" />
            )
          )}
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {subtitle && !isMobile && (
              <p className="text-sm text-muted-foreground truncate max-w-md">{subtitle}</p>
            )}
          </div>
        </div>
        <div className={cn("flex text-muted-foreground text-sm", isMobile ? "flex-col items-end gap-0.5" : "items-center gap-4")}>
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
        </div>
      </div>

      {/* Entity selection - Enemies and Players tabs */}
      <Tabs value={activeTab} onValueChange={(v) => {
        setActiveTab(v as 'enemies' | 'players');
        setIsEntityPanelOpen(true);
      }} className="mb-3">
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
                {showHints && !isMobile && (
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
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-destructive border border-destructive/40 bg-destructive/10 hover:text-destructive-foreground hover:bg-destructive/90 transition-colors"
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
                        <button
                          onClick={() => onSelectEnemies(mergedEnemies.filter(e => e.boss).map(e => e.id))}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Select Bosses
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {enemyGroups.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No enemies in this encounter</p>
                    ) : (
                      enemyGroups.map((group) => {
                        // Single enemy — render as before, no grouping chrome
                        if (group.enemies.length === 1) {
                          const enemy = group.enemies[0];
                          const isSelected = isEnemySelected(enemy.id);
                          const colors = statusColors[getEnemyStatus(enemy)];
                          const btn = (
                            <button
                              key={enemy.id}
                              onClick={() => onToggleEnemy(enemy.id)}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-all",
                                `${colors.bg} border ${colors.border}`,
                                isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                hasSelection && !isSelected && "opacity-50"
                              )}
                            >
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                colors.dot
                              )} />
                              {enemy.boss && (
                                <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                              )}
                              <span className="font-medium">{enemy.name}</span>
                            </button>
                          );
                          if (isMobile) return btn;
                          return (
                            <HintTooltip key={enemy.id}>
                              <TooltipTrigger asChild>
                                {btn}
                              </TooltipTrigger>
                              <TooltipContent side="bottom" hideArrow className="p-3 bg-card text-card-foreground border border-border">
                                {formatPeriodsTooltip(enemy.id, enemy.periods)}
                              </TooltipContent>
                            </HintTooltip>
                          );
                        }

                        // Multi-enemy group — popover to expand individuals
                        const groupIds = group.enemies.map(e => e.id);
                        const allSelected = groupIds.every(id => isEnemySelected(id));
                        const someSelected = !allSelected && groupIds.some(id => isEnemySelected(id));
                        const selectedCount = groupIds.filter(id => isEnemySelected(id)).length;
                        const grpColors = statusColors[getGroupStatus(group.enemies)];
                        return (
                          <PopoverPrimitive.Root key={group.name}>
                            <PopoverPrimitive.Trigger asChild>
                              <button
                                className={cn(
                                  "flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-all",
                                  `${grpColors.bg} border ${grpColors.border}`,
                                  allSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                  someSelected && "ring-2 ring-primary/50 ring-offset-1 ring-offset-background",
                                  hasSelection && !allSelected && !someSelected && "opacity-50"
                                )}
                              >
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                  grpColors.dot
                                )} />
                                {group.boss && (
                                  <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                                )}
                                <span className="font-medium">{group.name}</span>
                                <span className="text-muted-foreground ml-0.5">
                                  {someSelected ? `${selectedCount}/` : "×"}{group.enemies.length}
                                </span>
                              </button>
                            </PopoverPrimitive.Trigger>
                            <PopoverPrimitive.Portal>
                              <PopoverPrimitive.Content
                                side="bottom"
                                align="start"
                                sideOffset={4}
                                avoidCollisions
                                collisionPadding={16}
                                className={cn(
                                  "z-50 rounded-lg border-2 border-border/80 bg-card text-card-foreground shadow-xl overflow-y-auto styled-scrollbar p-2",
                                  "animate-in fade-in-0 zoom-in-95",
                                  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                                  isMobile
                                    ? "max-w-[calc(100vw-2rem)] max-h-[50vh]"
                                    : "w-64 max-h-72"
                                )}
                              >
                                <div className="flex items-center justify-between mb-2 px-1">
                                  <span className="text-xs font-semibold">{group.name}</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleEnemyGroup(groupIds)}
                                      className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      {allSelected ? "Deselect all" : "Select all"}
                                    </button>
                                    <PopoverPrimitive.Close asChild>
                                      <button className="text-2xs text-red-400 hover:text-red-300 transition-colors">
                                        Close
                                      </button>
                                    </PopoverPrimitive.Close>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {group.enemies.map((enemy, idx) => {
                                    const isSelected = isEnemySelected(enemy.id);
                                    const eColors = statusColors[getEnemyStatus(enemy)];
                                    const btn = (
                                      <button
                                        key={enemy.id}
                                        onClick={() => onToggleEnemy(enemy.id)}
                                        className={cn(
                                          "flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-all",
                                          `${eColors.bgLight} border ${eColors.borderLight}`,
                                          isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                          hasSelection && !isSelected && "opacity-50"
                                        )}
                                      >
                                        <span className={cn(
                                          "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                          eColors.dot
                                        )} />
                                        <span className="font-medium">{enemy.name} #{idx + 1}</span>
                                      </button>
                                    );
                                    if (isMobile) return btn;
                                    return (
                                      <HintTooltip key={enemy.id}>
                                        <TooltipTrigger asChild>
                                          {btn}
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" hideArrow className="p-3 bg-card text-card-foreground border border-border">
                                          {formatPeriodsTooltip(enemy.id, enemy.periods)}
                                        </TooltipContent>
                                      </HintTooltip>
                                    );
                                  })}
                                </div>
                              </PopoverPrimitive.Content>
                            </PopoverPrimitive.Portal>
                          </PopoverPrimitive.Root>
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
                                  style={{ color: `var(--color-class-${className.toLowerCase()})` }}
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
                              style={{ color: `var(--color-class-${className.toLowerCase()})` }}
                              onClick={() => onTogglePlayers(classPlayers.map(p => p.guid))}
                              title={`Toggle all ${className.toLowerCase()}s`}
                            >
                              {className.slice(0, 3)}:
                            </span>
                          )}
                          {classPlayers.map((player) => {
                            const isSelected = isPlayerSelected(player.guid);
                            return (
                              <HintTooltip key={player.guid}>
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
                                      style={{ backgroundColor: `var(--color-class-${player.class.toLowerCase()})` }}
                                    />
                                    <span
                                      className="font-medium"
                                      style={{ color: `var(--color-class-${player.class.toLowerCase()})` }}
                                    >
                                      {player.name}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" hideArrow className="p-3 bg-card text-card-foreground border">
                                  <div className="space-y-2 max-w-xs">
                                    <div className="font-medium border-b border-border pb-1 flex items-center gap-2">
                                      <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: `var(--color-class-${player.class.toLowerCase()})` }}
                                      />
                                      <span style={{ color: `var(--color-class-${player.class.toLowerCase()})` }}>
                                        {player.name}
                                      </span>
                                      <span className="text-muted-foreground text-xs font-normal">
                                        {formatRaceLabel(player.race)} {formatClassLabel(player.class)}
                                      </span>
                                    </div>
                                    {instance.realm && (
                                      <Link
                                        to={`/armory/${encodeURIComponent(instance.realm)}/${encodeURIComponent(player.name)}`}
                                        className="text-xs text-primary hover:underline flex items-center gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        View Armory
                                      </Link>
                                    )}
                                    <details className="text-xs text-muted-foreground">
                                      <summary className="cursor-pointer hover:text-foreground">Debug</summary>
                                      <div className="font-mono mt-1">{player.guid}</div>
                                    </details>
                                  </div>
                                </TooltipContent>
                              </HintTooltip>
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

      {/* Preset layout tabs */}
      <div className="flex gap-1 overflow-x-auto mb-3 pb-1 pt-1 styled-scrollbar">
        {PRESET_LAYOUTS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPresetChange(preset.id)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors",
              activePresetId === preset.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Events Panels */}
      <PanelTimingProvider panelCount={layoutItems.length}>
        <PanelTimingResetter encounters={encounters} />

        <ChartDataRegistryProvider>
          <PortalContainerProvider container={typeof document === "undefined" ? null : document.body}>
            <EventsPanelGrid
              layoutItems={layoutItems}
              panelTypesById={panelTypesById}
              panelOptionsById={panelOptionsById}
              seedFiltersByID={seedFiltersByID}
              seedFiltersVersion={seedFiltersVersion}
              durationMs={totalDurationMs}
              context={panelContext}
              showHints={showHints}
              isMobile={isMobile}
              onPanelTypeChange={onPanelTypeChange}
              onPanelOptionChange={onPanelOptionChange}
              onPanelFiltersChange={onPanelFiltersChange}
              onExplainerClick={onExplainerClick}
            />
          </PortalContainerProvider>
        </ChartDataRegistryProvider>

        {layoutPopup && createPortal(
          <PoppedOutLayoutContent
            key={layoutPopup.sessionId}
            session={layoutPopup}
            durationMs={totalDurationMs}
            context={panelContext}
            showHints={showHints}
            actionBarSlots={actionBarSlots}
            layouts={layouts}
            onExplainerClick={onExplainerClick}
          />,
          layoutPopup.container,
        )}

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
  /** Callback to open the time range controller overlay */
  onOpenTimeRange?: () => void;
  /** Whether user has admin_logs permission */
  canAdminLogs?: boolean;
  /** Duplicate group ID if this instance is part of a group */
  duplicateGroupId?: string;
}

export function InstancePageView({
  instance,
  selectedEncounterIds: _selectedEncounterIds,
  onSelectEncounters,
  youtubeButton,
  logDetailUrl,
  onOpenTimeRange,
  canAdminLogs,
  duplicateGroupId,
}: InstancePageViewProps) {
  const timeRange = useTimeRangeContextOptional();

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

  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user_id;
  const createShare = useCreateShare();
  const instanceDefaults = useInstanceDefaultsCache(isLoggedIn);

  const cachedDefaultLayout = useMemo(() => {
    const layout = isMobile
      ? instanceDefaults?.default_mobile_layout
      : instanceDefaults?.default_desktop_layout;
    if (!layout) {
      return null;
    }

    return parsePanelLayout(layout);
  }, [instanceDefaults?.default_desktop_layout, instanceDefaults?.default_mobile_layout, isMobile]);

  const defaultLayoutId = isMobile
    ? instanceDefaults?.default_mobile_layout?.id ?? null
    : instanceDefaults?.default_desktop_layout?.id ?? null;

  const standardOrderedLayoutItems = useMemo(
    () => orderLayoutItems(normalizeLayoutItems(cachedDefaultLayout?.items ?? DEFAULT_INSTANCE_LAYOUT_ITEMS)),
    [cachedDefaultLayout?.items],
  );

  const alternateOrderedLayoutItems = useMemo(
    () => orderLayoutItems(normalizeLayoutItems(ALTERNATE_INSTANCE_LAYOUT_ITEMS)),
    [],
  );

  const defaultPanelTypesByID = cachedDefaultLayout?.panelTypesById ?? DEFAULT_INSTANCE_PANEL_TYPES;

  const defaultOrderedPanels = useMemo<PanelType[]>(
    () =>
      standardOrderedLayoutItems.map(
        (item) => (defaultPanelTypesByID[item.id] ?? "empty") as PanelType,
      ),
    [defaultPanelTypesByID, standardOrderedLayoutItems],
  );

  const defaultEncounterIDs = useMemo(
    () => instance.encounters.map((e) => e.id),
    [instance.encounters],
  );

  const [layoutPopup, setLayoutPopup] = useState<LayoutPopupSession | null>(null);
  const layoutPopupRef = useRef<LayoutPopupSession | null>(null);

  const [importedLayoutItems, setImportedLayoutItems] = useState<GridEditorItem[] | null>(null);

  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(defaultLayoutId);

  const createDefaultViewState = useCallback((): LocalInstanceViewState => ({
    encounters: instance.encounters.filter(e => e.kill_type !== "wipe" && e.kill_type !== "reset").map(e => e.id),
    enemies: new Set<string>(),
    players: new Set<string>(),
    panels: defaultOrderedPanels,
    panelOptions: defaultOrderedPanels.map((_, i) => {
      const itemId = standardOrderedLayoutItems[i]?.id;
      return itemId ? (DEFAULT_INSTANCE_PANEL_OPTIONS[itemId] ?? null) : null;
    }),
    layout: "standard",
    includeWipes: false,
  }), [instance.encounters, defaultOrderedPanels, standardOrderedLayoutItems]);

  const [viewState, setViewState] = useState<LocalInstanceViewState>(() =>
    createDefaultViewState(),
  );


  const previousInstanceIDRef = useRef(instance.id);

  useEffect(() => {
    if (previousInstanceIDRef.current === instance.id) {
      return;
    }

    previousInstanceIDRef.current = instance.id;
    const popup = layoutPopupRef.current;
    layoutPopupRef.current = null;
    if (popup && !popup.window.closed) {
      popup.window.close();
    }
    setLayoutPopup(null);
    setViewState(createDefaultViewState());
    setImportedLayoutItems(null);
    setActiveLayoutId(defaultLayoutId);
  }, [createDefaultViewState, defaultLayoutId, instance.id]);

  const setEncounters = useCallback((ids: string[]) => {
    setViewState((prev) => ({ ...prev, encounters: ids }));
  }, []);

  const setIncludeWipes = useCallback((value: boolean) => {
    setViewState((prev) => ({ ...prev, includeWipes: value }));
  }, []);

  const setEnemies = useCallback((ids: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setViewState((prev) => ({
      ...prev,
      enemies: typeof ids === "function" ? ids(prev.enemies) : ids,
    }));
  }, []);

  const setPlayers = useCallback((ids: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setViewState((prev) => ({
      ...prev,
      players: typeof ids === "function" ? ids(prev.players) : ids,
    }));
  }, []);

  const setPanelType = useCallback((index: number, type: PanelType) => {
    setViewState((prev) => {
      const panels = [...prev.panels];
      const panelOptions = [...prev.panelOptions];
      while (panels.length <= index) {
        panels.push("empty");
        panelOptions.push(null);
      }
      panels[index] = type;
      panelOptions[index] = null;
      return { ...prev, panels, panelOptions };
    });
  }, []);

  const setPanelOption = useCallback((index: number, option: string | null) => {
    setViewState((prev) => {
      const panelOptions = [...prev.panelOptions];
      while (panelOptions.length <= index) {
        panelOptions.push(null);
      }
      panelOptions[index] = option;
      return { ...prev, panelOptions };
    });
  }, []);

  const setPanels = useCallback((panels: PanelType[], panelOptions?: Array<string | null>) => {
    const nextOptions = panelOptions
      ? [...panelOptions, ...Array(Math.max(0, panels.length - panelOptions.length)).fill(null)]
      : panels.map(() => null);
    setViewState((prev) => ({ ...prev, panels: [...panels], panelOptions: nextOptions.slice(0, panels.length) }));
  }, []);

  const setLayout = useCallback((layout: LayoutType) => {
    setViewState((prev) => ({ ...prev, layout }));
  }, []);

  useEffect(() => {
    if (importedLayoutItems === null) {
      setActiveLayoutId(defaultLayoutId);
    }
  }, [defaultLayoutId, importedLayoutItems]);

  const resetView = useCallback(() => {
    setViewState(createDefaultViewState());
    setImportedLayoutItems(null);
    setActiveLayoutId(defaultLayoutId);
    setActivePresetId(DEFAULT_PRESET_ID);
  }, [createDefaultViewState, defaultLayoutId]);

  // ── Preset layouts ──────────────────────────────────────────────────────
  const [activePresetId, setActivePresetId] = useState<string | null>(DEFAULT_PRESET_ID);

  const applyPreset = useCallback((presetId: string) => {
    const preset = PRESET_LAYOUTS_BY_ID[presetId];
    if (!preset) return;

    const items = orderLayoutItems(normalizeLayoutItems(preset.layoutItems));
    const panels = items.map((item) => (preset.panelTypes[item.id] ?? "empty") as PanelType);
    const panelOptions = items.map((item) => preset.panelOptions[item.id] ?? null);

    setImportedLayoutItems(items);
    setViewState((prev) => ({
      ...prev,
      panels,
      panelOptions,
      layout: "standard",
    }));
    setSeedFiltersByID(preset.panelFilters);
    setSeedFiltersVersion((v) => v + 1);
    setPanelFiltersByID(preset.panelFilters);
    setActivePresetId(presetId);
  }, []);

  useEffect(() => {
    if (!layoutPopup) return;

    const popupWindow = layoutPopup.window;
    const handlePopupClose = () => {
      if (layoutPopupRef.current?.window === popupWindow) {
        layoutPopupRef.current = null;
        setLayoutPopup(null);
      }
    };
    const syncAppearance = () => {
      if (!popupWindow.closed) {
        syncPopupAppearance(document, popupWindow.document);
      }
    };

    syncAppearance();
    popupWindow.addEventListener("beforeunload", handlePopupClose);
    const appearanceObserver = new MutationObserver(syncAppearance);
    appearanceObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    appearanceObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      popupWindow.removeEventListener("beforeunload", handlePopupClose);
      appearanceObserver.disconnect();
    };
  }, [layoutPopup]);

  useEffect(() => () => {
    const popup = layoutPopupRef.current;
    layoutPopupRef.current = null;
    if (popup && !popup.window.closed) {
      popup.window.close();
    }
  }, []);

  const clearEntitySelection = useCallback(() => {
    setViewState((prev) => ({ ...prev, enemies: new Set(), players: new Set() }));
  }, []);

  const hasMigratedLegacyUrlStateRef = useRef(false);

  useEffect(() => {
    if (hasMigratedLegacyUrlStateRef.current) {
      return;
    }

    const legacyView = searchParams.get("v");
    const legacyLayout = searchParams.get("l");

    if (!legacyView && !legacyLayout) {
      hasMigratedLegacyUrlStateRef.current = true;
      return;
    }

    if (legacyView) {
      const [encPart, enemyPart, playerPart, panelPart] = legacyView.split(".");

      const parsedEncounters = (() => {
        if (encPart === "all" || !encPart) return defaultEncounterIDs;
        if (encPart === "bosses") return instance.encounters.filter((enc) => enc.boss).map((enc) => enc.id);
        if (encPart === "trash") return instance.encounters.filter((enc) => !enc.boss).map((enc) => enc.id);
        const ids = encPart
          .split("-")
          .map((v) => Number.parseInt(v, 10))
          .filter((v) => !Number.isNaN(v))
          .map((idx) => instance.encounters[idx]?.id)
          .filter((id): id is string => Boolean(id));
        return ids.length > 0 ? ids : defaultEncounterIDs;
      })();

      const parsedEnemies = new Set(
        (enemyPart || "")
          .split("-")
          .map((v) => Number.parseInt(v, 10))
          .filter((v) => !Number.isNaN(v))
          .map((idx) => allMergedEnemies[idx]?.id)
          .filter((id): id is string => Boolean(id)),
      );

      const sortedPlayerIDs = Object.keys(instance.players ?? {}).sort();
      const parsedPlayers = new Set(
        (playerPart || "")
          .split("-")
          .map((v) => Number.parseInt(v, 10))
          .filter((v) => !Number.isNaN(v))
          .map((idx) => sortedPlayerIDs[idx])
          .filter((id): id is string => Boolean(id)),
      );

      const panelParts = (panelPart || "").split("-").filter(Boolean).map(parseLegacyPanelCode);
      const parsedPanels: PanelType[] = Array.from({ length: Math.max(panelParts.length, defaultOrderedPanels.length) }, (_, i) => {
        const code = panelParts[i]?.code;
        return (code && LEGACY_PANEL_CODE_TO_TYPE[code]) ?? defaultOrderedPanels[i] ?? "empty";
      });
      const parsedPanelOptions = Array.from({ length: parsedPanels.length }, (_, i) => panelParts[i]?.option ?? null);

      setViewState((prev) => ({
        ...prev,
        encounters: parsedEncounters,
        enemies: parsedEnemies,
        players: parsedPlayers,
        panels: parsedPanels,
        panelOptions: parsedPanelOptions,
      }));
    }

    if (legacyLayout) {
      setLayout(legacyLayout === "a" ? "alternate" : "standard");
    }

    hasMigratedLegacyUrlStateRef.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("v");
      next.delete("l");
      return next;
    });
  }, [allMergedEnemies, defaultEncounterIDs, defaultOrderedPanels, instance.encounters, instance.players, searchParams, setLayout, setSearchParams]);

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
      const defaultType = (defaultPanelTypesByID[item.id] ?? "empty") as EventsPanelType;
      const resolved = (urlType ?? defaultType) as EventsPanelType;
      next[item.id] = resolved in PANELS ? resolved : "empty";
    });
    return next;
  }, [activeLayoutItems, defaultPanelTypesByID, viewState.panels]);

  const panelOptionsByID = useMemo<Record<string, string | null>>(() => {
    const next: Record<string, string | null> = {};
    activeLayoutItems.forEach((item, index) => {
      next[item.id] = viewState.panelOptions[index] ?? null;
    });
    return next;
  }, [activeLayoutItems, viewState.panelOptions]);

  // Per-panel filters: collected from EventsPanel children for persistence in shared layouts.
  const [panelFiltersByID, setPanelFiltersByID] = useState<Record<string, PanelFilter[]>>(
    () => isMobile ? {} : { ...DEFAULT_INSTANCE_PANEL_FILTERS }
  );
  // Filters seeded from an imported shared view / layout book (consumed once by EventsPanel).
  const [seedFiltersByID, setSeedFiltersByID] = useState<Record<string, PanelFilter[]>>({});
  // Bumped on each import/cast to tell EventsPanel to re-apply seedFilters.
  const [seedFiltersVersion, setSeedFiltersVersion] = useState(0);

  const handlePanelFiltersChange = useCallback((itemID: string, filters: PanelFilter[]) => {
    setPanelFiltersByID((prev) => {
      if (filters.length === 0) {
        if (!(itemID in prev)) return prev;
        const next = { ...prev };
        delete next[itemID];
        return next;
      }
      return { ...prev, [itemID]: filters };
    });
  }, []);

  const popOutLayout = useCallback(() => {
    const existing = layoutPopupRef.current;
    if (existing && !existing.window.closed) {
      existing.window.focus();
      return;
    }

    const activeLayoutLabel = activePresetId
      ? PRESET_LAYOUTS_BY_ID[activePresetId]?.label ?? "Layout"
      : "Custom Layout";
    const popup = openLayoutPopup(
      window,
      instance.id,
      `${activeLayoutLabel} — ${instance.name} — Chronicle`,
    );
    if (!popup) {
      toast.error("The layout popup was blocked. Allow popups for Chronicle and try again.");
      return;
    }

    const session: LayoutPopupSession = {
      ...popup,
      sessionId: Date.now(),
      snapshot: {
        layoutItems: activeLayoutItems.map((item) => ({ ...item })),
        panelTypesById: { ...panelTypesByID },
        panelOptionsById: { ...panelOptionsByID },
        panelFiltersById: structuredClone(panelFiltersByID),
        activePresetId,
      },
    };
    layoutPopupRef.current = session;
    setLayoutPopup(session);
    popup.window.focus();
  }, [
    activeLayoutItems,
    activePresetId,
    instance.id,
    instance.name,
    panelFiltersByID,
    panelOptionsByID,
    panelTypesByID,
  ]);

  // Use URL state if present, otherwise default to all encounters
  const internalSelectedIds = useMemo(() => {
    if (viewState.encounters.length > 0) {
      // Filter to only valid encounter IDs
      const validIds = viewState.encounters.filter(id => 
        instance.encounters.some(e => e.id === id)
      );
      if (validIds.length > 0) return validIds;
    }
    // Default to encounters respecting includeWipes setting
    return instance.encounters
      .filter(e => viewState.includeWipes || (e.kill_type !== "wipe" && e.kill_type !== "reset"))
      .map(e => e.id);
  }, [viewState.encounters, viewState.includeWipes, instance.encounters]);
  
  const setInternalSelectedIds = useCallback((ids: string[]) => {
    setEncounters(ids);
    onSelectEncounters?.(ids);
  }, [onSelectEncounters, setEncounters]);
  
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
      setEncounters(propsIds);
    }
  }, [_selectedEncounterIds, internalSelectedIds, setEncounters]);

  // Reset time range selection when selected encounters change
  const prevEncounterIdsRef = useRef(internalSelectedIds);
  useEffect(() => {
    if (prevEncounterIdsRef.current !== internalSelectedIds) {
      prevEncounterIdsRef.current = internalSelectedIds;
      timeRange?.reset();
    }
  }, [internalSelectedIds, timeRange]);
  
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [hasSeenSelector, setHasSeenSelector] = useState(() => hasSeenEncounterSelector());
  const [shareContextMenu, setShareContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [actionBarOpen, setActionBarOpen] = useState(false);
  
  // Handle encounter FAB click - mark as seen and toggle sidebar
  const handleEncounterButtonClick = () => {
    if (!hasSeenSelector) {
      markEncounterSelectorSeen();
      setHasSeenSelector(true);
    }
    setActionBarOpen(false);
    setSidebarOpen(!sidebarOpen);
  };

  
  // Close sidebar when switching to mobile view
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);
  
  const actionBarSlots = useMemo(
    () => toLayoutActionBarSlots(instanceDefaults?.action_bar_slots),
    [instanceDefaults?.action_bar_slots],
  );


  const actionBarLayoutsByID = useMemo(
    () => new Map((instanceDefaults?.action_bar_layouts ?? []).map((layout) => [layout.id, layout])),
    [instanceDefaults?.action_bar_layouts],
  );

  const entitySelection = useMemo<EntitySelection>(() => ({
    enemyIds: viewState.enemies,
    playerIds: viewState.players,
  }), [viewState.enemies, viewState.players]);
  
  // Toggle enemy selection
  const toggleEnemySelection = useCallback((enemyId: string) => {
    setEnemies((prev) => {
      const next = new Set(prev);
      if (next.has(enemyId)) {
        next.delete(enemyId);
      } else {
        next.add(enemyId);
      }
      return next;
    });
  }, [setEnemies]);
  
  // Select multiple enemies at once (replaces current selection)
  const selectEnemies = useCallback((enemyIds: string[]) => {
    setEnemies(new Set(enemyIds));
  }, [setEnemies]);
  
  // Toggle player selection
  const togglePlayerSelection = useCallback((playerId: string) => {
    setPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }, [setPlayers]);
  
  // Toggle multiple players at once (if any are selected, deselect all; otherwise select all)
  const togglePlayersSelection = useCallback((playerIds: string[]) => {
    setPlayers((prev) => {
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
  }, [setPlayers]);

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
    // Clear stale filters / set defaults for the new panel type.
    const newPanel = PANELS[type as keyof typeof PANELS];
    const defaults = newPanel?.defaultFilters;
    setPanelFiltersByID((prev) => {
      if (defaults && defaults.length > 0) {
        return { ...prev, [itemID]: defaults };
      }
      if (!(itemID in prev)) return prev;
      const rest = { ...prev };
      delete rest[itemID];
      return rest;
    });
    setActivePresetId(null); // User customized panels – clear preset
  }, [activeLayoutItems, setPanelType]);

  const handlePanelOptionChangeByID = useCallback((itemID: string, option: string | null) => {
    const idx = activeLayoutItems.findIndex((item) => item.id === itemID);
    if (idx === -1) return;
    setPanelOption(idx, option);
  }, [activeLayoutItems, setPanelOption]);

  const applySharedViewPayload = useCallback((payload: SharedViewPayload) => {
    const payloadInstanceID = payload.instanceId ?? payload.instance_id;
    if (payloadInstanceID !== instance.id) {
      throw new Error("Shared view belongs to a different instance");
    }

    const layoutItems = payload.layout?.items ?? payload.items ?? [];
    const panelTypesById = payload.layout?.panelTypesById ?? payload.panelTypesById ?? {};

    const normalizedItems = normalizeLayoutItems(layoutItems);
    if (normalizedItems.length === 0) {
      throw new Error("Shared view is missing layout items");
    }

    const importedTypes: Record<string, EventsPanelType> = {};
    normalizedItems.forEach((item) => {
      const candidate = panelTypesById[item.id] ?? "empty";
      importedTypes[item.id] = candidate in PANELS ? candidate : "empty";
    });

    const orderedItems = orderLayoutItems(normalizedItems);
    const orderedPanels = orderedItems.map((item) => (importedTypes[item.id] ?? "empty") as PanelType);
    const orderedOptions = orderedItems.map((item) => {
      const raw = payload.view?.panelOptions?.[item.id];
      return typeof raw === "string" ? raw : null;
    });

    const encounterIds = (() => {
      const enc = payload.view?.encounters;
      if (enc === "all" || !enc) {
        return instance.encounters.map((e) => e.id);
      }
      if (enc === "bosses") {
        return instance.encounters.filter((e) => e.boss).map((e) => e.id);
      }
      if (enc === "trash") {
        return instance.encounters.filter((e) => !e.boss).map((e) => e.id);
      }
      return enc
        .split("-")
        .map((v) => Number.parseInt(v, 10))
        .filter((v) => !Number.isNaN(v))
        .map((idx) => instance.encounters[idx]?.id)
        .filter((id): id is string => Boolean(id));
    })();

    const enemyIDs = new Set(
      (payload.view?.enemies ?? [])
        .map((idx) => allMergedEnemies[idx]?.id)
        .filter((id): id is string => Boolean(id)),
    );

    const playerKeys = Object.keys(instance.players ?? {}).sort();
    const playerIDs = new Set(
      (payload.view?.players ?? [])
        .map((idx) => playerKeys[idx])
        .filter((id): id is string => Boolean(id)),
    );

    const resolvedEncounters = encounterIds.length > 0 ? encounterIds : instance.encounters.map((e) => e.id);
    setViewState((prev) => ({
      ...prev,
      panels: orderedPanels,
      panelOptions: orderedOptions,
      encounters: resolvedEncounters,
      enemies: enemyIDs,
      players: playerIDs,
      includeWipes: payload.view?.includeWipes ?? false,
    }));
    // Sync the parent so its encounter state matches, preventing the
    // parent→child sync effect from overwriting the shared-link selection.
    onSelectEncounters?.(resolvedEncounters);
    setActiveLayoutId(typeof payload.layoutId === "string" ? payload.layoutId : null);
    setImportedLayoutItems(orderedItems);
    setActivePresetId(null);

    // Restore per-panel filters if present in the payload.
    const importedFilters: Record<string, PanelFilter[]> = {};
    if (payload.view?.panelFilters) {
      for (const [id, filters] of Object.entries(payload.view.panelFilters)) {
        if (Array.isArray(filters) && filters.length > 0) {
          importedFilters[id] = filters;
        }
      }
    }
    setSeedFiltersByID(importedFilters);
    setPanelFiltersByID(importedFilters);
    setSeedFiltersVersion((v) => v + 1);

    // Restore time range selection if present
    if (payload.view?.timeRange && timeRange) {
      timeRange.setRange(payload.view.timeRange.startMs, payload.view.timeRange.endMs);
    } else {
      timeRange?.reset();
    }
  }, [allMergedEnemies, instance.encounters, instance.id, instance.players, onSelectEncounters, setViewState, timeRange]);

  const handleExportLayout = useCallback(() => {
    const payload = {
      version: 1,
      items: activeLayoutItems,
      panelTypesById: panelTypesByID,
      panelOptionsById: Object.fromEntries(
        Object.entries(panelOptionsByID).filter(([, v]) => v !== null),
      ),
      ...(Object.keys(panelFiltersByID).length > 0
        ? { panelFiltersById: panelFiltersByID }
        : {}),
    };
    const json = JSON.stringify(payload, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      toast.success("Layout copied to clipboard");
    }).catch(() => {
      window.prompt("Copy this layout JSON:", json);
    });
  }, [activeLayoutItems, panelTypesByID, panelOptionsByID, panelFiltersByID]);

  const handleImportLayout = useCallback(() => {
    const raw = window.prompt("Paste exported layout JSON");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        version?: number;
        items?: GridEditorItem[];
        panelTypesById?: Record<string, EventsPanelType>;
        panelOptionsById?: Record<string, string>;
        panelFiltersById?: Record<string, PanelFilter[]>;
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
      const orderedOptions = orderedItems.map((item) => {
        const option = parsed.panelOptionsById?.[item.id];
        return typeof option === "string" ? option : null;
      });
      setPanels(orderedPanels, orderedOptions);

      setActiveLayoutId(null);
      setImportedLayoutItems(orderedItems);
      setActivePresetId(null);

      // Restore per-panel filters from imported layout.
      const importedFilters: Record<string, PanelFilter[]> = {};
      if (parsed.panelFiltersById) {
        for (const [id, filters] of Object.entries(parsed.panelFiltersById)) {
          if (Array.isArray(filters) && filters.length > 0) {
            importedFilters[id] = filters;
          }
        }
      }
      setSeedFiltersByID(importedFilters);
      setPanelFiltersByID(importedFilters);
      setSeedFiltersVersion((v) => v + 1);

      toast.success("Imported layout", { description: `Applied ${orderedItems.length} panel${orderedItems.length === 1 ? "" : "s"}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid layout JSON";
      toast.error("Import failed", { description: message });
    }
  }, [setPanels]);

  const buildSharedViewPayload = useCallback((): SharedViewPayload => ({
      version: 2,
      instanceId: instance.id,
      layoutId: activeLayoutId ?? undefined,
      layout: {
        items: activeLayoutItems,
        panelTypesById: panelTypesByID,
      },
      view: {
        encounters: viewState.encounters.length > 0
          ? viewState.encounters
            .map((id) => instance.encounters.findIndex((enc) => enc.id === id))
            .filter((idx) => idx >= 0)
            .join("-")
          : "all",
        enemies: Array.from(viewState.enemies)
          .map((id) => allMergedEnemies.findIndex((enemy) => enemy.id === id))
          .filter((idx) => idx >= 0),
        players: Array.from(viewState.players)
          .map((id) => Object.keys(instance.players ?? {}).sort().indexOf(id))
          .filter((idx) => idx >= 0),
        panelOptions: Object.fromEntries(
          Object.entries(panelOptionsByID).filter(([, value]) => value !== null),
        ),
        ...(Object.keys(panelFiltersByID).length > 0 ? { panelFilters: panelFiltersByID } : {}),
        ...(viewState.includeWipes ? { includeWipes: true } : {}),
        ...(timeRange?.enabled && timeRange.startOffsetMs != null && timeRange.endOffsetMs != null
          ? { timeRange: { startMs: timeRange.startOffsetMs, endMs: timeRange.endOffsetMs } }
          : {}),
      },
    }), [activeLayoutId, activeLayoutItems, allMergedEnemies, instance.encounters, instance.id, instance.players, panelFiltersByID, panelOptionsByID, panelTypesByID, timeRange?.enabled, timeRange?.startOffsetMs, timeRange?.endOffsetMs, viewState.encounters, viewState.enemies, viewState.includeWipes, viewState.players]);

  const copyStateToClipboard = useCallback(async () => {
    try {
      const payload = buildSharedViewPayload();
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success("State JSON copied");
    } catch {
      toast.error("Failed to copy state JSON");
    }
  }, [buildSharedViewPayload]);

  const importStateFromJSON = useCallback(() => {
    const raw = window.prompt("Paste shared state JSON");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SharedViewPayload;
      applySharedViewPayload(parsed);
      toast.success("State imported from JSON");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid state JSON";
      toast.error("Import failed", { description: message });
    }
  }, [applySharedViewPayload]);

  const handleShareButtonContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setShareContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  useEffect(() => {
    if (!shareContextMenu) return;

    const close = () => setShareContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [shareContextMenu]);

  const handleShareView = useCallback(async () => {
    const payload: SharedViewPayload = buildSharedViewPayload();

    try {
      const result = await createShare.mutateAsync({
        instance_id: instance.id,
        payload: payload as unknown as Record<string, string>,
      });
      await navigator.clipboard.writeText(result.url);
      toast.success("Share link copied", { description: result.url });
    } catch {
      toast.error("Failed to create share link");
    }
  }, [buildSharedViewPayload, createShare, instance.id]);

  const handleShareWithoutLayout = useCallback(async () => {
    const url = `${window.location.origin}/instances/${instance.slug || instance.id}`;

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: url });
    } catch {
      toast.error("Failed to copy link");
    }
  }, [instance.slug, instance.id]);


  const castResetToDefault = useCallback(() => {
    resetView();
    toast.success("Cast layout", { description: "Reset to Default" });
  }, [resetView]);

  const castLayout = useCallback((layout: UserPanelLayout) => {
    try {
      const parsed = parsePanelLayout(layout);
      const normalizedItems = normalizeLayoutItems(parsed.items);
      const castTypes: Record<string, EventsPanelType> = {};
      normalizedItems.forEach((item) => {
        const candidate = parsed.panelTypesById?.[item.id] ?? "empty";
        castTypes[item.id] = candidate in PANELS ? candidate : "empty";
      });

      const orderedItems = orderLayoutItems(normalizedItems);
      const orderedPanels = orderedItems.map((item) => (castTypes[item.id] ?? "empty") as PanelType);
      const orderedOptions = orderedItems.map((item) => {
        const option = parsed.panelOptionsById?.[item.id];
        return typeof option === "string" ? option : null;
      });
      setPanels(orderedPanels, orderedOptions);
      setActiveLayoutId(layout.id);
      setImportedLayoutItems(orderedItems);
      setActivePresetId(null);

      // Restore per-panel filters from the layout.
      const importedFilters: Record<string, PanelFilter[]> = {};
      if (parsed.panelFiltersById) {
        for (const [id, filters] of Object.entries(parsed.panelFiltersById)) {
          if (Array.isArray(filters) && filters.length > 0) {
            importedFilters[id] = filters;
          }
        }
      }
      setSeedFiltersByID(importedFilters);
      setPanelFiltersByID(importedFilters);
      setSeedFiltersVersion((v) => v + 1);

      toast.success("Cast layout", { description: layout.title });
    } catch {
      toast.error("Failed to cast layout", { description: "Layout payload is invalid." });
    }
  }, [setPanels]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (event.key < "0" || event.key > "9") {
        return;
      }

      setActionBarOpen(true);
      const layoutID = actionBarSlots[event.key as keyof LayoutActionBarSlots];
      if (!layoutID) {
        return;
      }

      const layout = actionBarLayoutsByID.get(layoutID);
      if (!layout) {
        return;
      }

      event.preventDefault();
      castLayout(layout);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionBarLayoutsByID, actionBarSlots, castLayout]);


  useEffect(() => {
    const importCode = searchParams.get("import");
    if (!importCode) return;

    let cancelled = false;
    void (async () => {
      try {
        const shared = await fetchSharedView(importCode);
        if (cancelled) return;
        const payload = shared.payload as unknown as SharedViewPayload;
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("import");
          return next;
        });
        applySharedViewPayload(payload);
        toast.success("Loaded view from shared url, refreshing the page will reset to your default layout.");
      } catch {
        if (cancelled) return;
        toast.error("Failed to import shared view");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySharedViewPayload, instance.id, searchParams, setSearchParams]);

  const selectedEncounters = useMemo(
    () => instance.encounters.filter((e) => selectedIds.includes(e.id)),
    [instance.encounters, selectedIds],
  );
  const trashGroups = groupTrashEncounters(instance.encounters);

  const headerBg = getInstanceBackground(instance.name);
  const heroic = isHeroic(instance);

  const elapsedDurationMs = instance.endTime
    ? new Date(instance.endTime).getTime() - new Date(instance.startTime).getTime()
    : null;
  const totalDuration = elapsedDurationMs !== null ? formatDurationMs(elapsedDurationMs) : null;
    
  // Compute total combat duration for selected encounters (used by explainer/panels)
  const totalDurationMs = useMemo(() => {
    return selectedEncounters.reduce((acc, enc) => {
      const start = new Date(enc.start_time).getTime();
      const end = new Date(enc.end_time).getTime();
      return acc + (end - start);
    }, 0);
  }, [selectedEncounters]);

  // Instance-wide combat duration (all encounters, for header)
  const instanceCombatDurationMs = useMemo(() => {
    return instance.encounters.reduce((acc, enc) => {
      const start = new Date(enc.start_time).getTime();
      const end = new Date(enc.end_time).getTime();
      return acc + (end - start);
    }, 0);
  }, [instance.encounters]);
  
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
      isMobile ? "px-2" : "px-4",

    )}>
      {/* Header */}
      <div className={cn("mb-6 rounded-lg border relative", heroic && "border-purple-500/30")}>
        {/* Background image */}
        {headerBg && (
          <div className="absolute inset-0 z-0 rounded-lg overflow-hidden">
            <img
              src={headerBg}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/70 to-background/50" />
            {heroic && (
              <div className="absolute inset-0 bg-gradient-to-r from-purple-900/10 via-purple-900/5 to-transparent" />
            )}
          </div>
        )}
        {/* Content */}
        <div className={cn("relative z-10", isMobile ? "p-3" : "p-4")}>
        {/* Row 1: Title (+ mobile menu / desktop difficulty) */}
        <div className="flex items-start justify-between gap-4 mb-1">
          <h1 className={cn("font-bold flex items-center gap-2", isMobile ? "text-xl" : "text-2xl", heroic && "drop-shadow-[0_0_8px_rgba(147,51,234,0.3)]")}>
            {instance.name}
            {duplicateGroupId && (
              <DuplicatesBadge instanceId={instance.id} duplicateGroupId={duplicateGroupId} />
            )}
          </h1>
          {!isMobile && instance.maxPlayers != null && instance.maxPlayers > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 mt-1">
              <span className="text-sm text-muted-foreground font-medium">{instance.maxPlayers} Player</span>
              {heroic && (
                <HeroicBadge />
              )}
            </div>
          )}
          {isMobile && (
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
              <InstanceMenu
                onImportLayout={handleImportLayout}
                onExportLayout={handleExportLayout}
                onPopOutLayout={popOutLayout}
                layoutPoppedOut={layoutPopup !== null}
                onResetView={resetView}
                onOpenTimeRange={onOpenTimeRange}
                instanceId={instance.id}
                logDetailUrl={logDetailUrl}
                layoutLabUrl={activeLayoutId ? `/account/layout-lab?layoutId=${activeLayoutId}` : undefined}
                duplicateGroupId={duplicateGroupId}
                canAdminLogs={canAdminLogs}
                isMobile={isMobile}
                isLoggedIn={isLoggedIn}
                onShareWithLayout={() => { void handleShareView(); }}
                onShareWithoutLayout={() => { void handleShareWithoutLayout(); }}
                youtubeButton={youtubeButton}
                showHints={showHints}
                onOpenHelp={() => setHelpOpen(true)}
              />
              {showHints && (
                <InstanceHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
              )}
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Metadata */}
        {isMobile ? (
          <div className="text-muted-foreground text-sm">
            {instance.guild && (
              <p>
                <Link to={`/g/${instance.guild.id}`} className="text-amber-500 hover:underline">&lt;{instance.guild.name}&gt;</Link>
              </p>
            )}
            <p>
              {instance.realm && `${instance.realm}`}
              {instance.realm && " • "}
              {formatTime(instance.startTime)}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {instance.guild && (
              <Link to={`/g/${instance.guild.id}`} className="text-amber-500 hover:underline">&lt;{instance.guild.name}&gt;</Link>
            )}
            {instance.guild && instance.realm && " • "}
            {instance.realm && `${instance.realm}`}
            {(instance.guild || instance.realm) && " • "}
            {formatTime(instance.startTime)}
          </p>
        )}

        {/* Row 3: Duration stats + action buttons (desktop) */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            {totalDuration && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{totalDuration}</span>
                    <span className="text-xs opacity-60">elapsed</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total time from first encounter start to last encounter end</TooltipContent>
              </Tooltip>
            )}
            {instanceCombatDurationMs > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDurationMs(instanceCombatDurationMs)}</span>
                    <span className="text-xs opacity-60">combat</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Sum of all encounter durations (active combat time)</TooltipContent>
              </Tooltip>
            )}
          </div>
          {isMobile && instance.maxPlayers != null && instance.maxPlayers > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground font-medium">{instance.maxPlayers} Player</span>
              {heroic && (
                <HeroicBadge />
              )}
            </div>
          )}
          {!isMobile && (
            <div className="flex items-center gap-2 shrink-0">
              <DropdownMenu modal={false}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <span onContextMenu={handleShareButtonContextMenu}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={!isLoggedIn}
                        >
                          <Share2 className="h-4 w-4" />
                          Share
                        </Button>
                      </span>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  {!isLoggedIn && <TooltipContent>You must be logged in to share</TooltipContent>}
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      void handleShareView();
                    }}
                  >
                    Share with layout
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void handleShareWithoutLayout();
                    }}
                  >
                    Share without layout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {youtubeButton}
              {showHints && (
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
              <InstanceMenu
                onImportLayout={handleImportLayout}
                onExportLayout={handleExportLayout}
                onPopOutLayout={popOutLayout}
                layoutPoppedOut={layoutPopup !== null}
                onResetView={resetView}
                onOpenTimeRange={onOpenTimeRange}
                instanceId={instance.id}
                logDetailUrl={logDetailUrl}
                layoutLabUrl={activeLayoutId ? `/account/layout-lab?layoutId=${activeLayoutId}` : undefined}
                duplicateGroupId={duplicateGroupId}
                canAdminLogs={canAdminLogs}
              />
            </div>
          )}
        </div>

        </div>
      </div>


      {/* Share context menu (right-click) */}
      {shareContextMenu && (
        <div
          className="fixed z-[120] min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ left: shareContextMenu.x, top: shareContextMenu.y }}
        >
          <button
            type="button"
            disabled={!isLoggedIn}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={() => {
              setShareContextMenu(null);
              void handleShareView();
            }}
          >
            Share
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setShareContextMenu(null);
              importStateFromJSON();
            }}
          >
            Import from JSON
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setShareContextMenu(null);
              void copyStateToClipboard();
            }}
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {actionBarOpen && (
        <div className="fixed bottom-5 left-0 right-0 z-[80] flex justify-center px-2 sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:px-0">
          <div className="inline-flex max-w-full flex-col items-center gap-2">
            {!isMobile && (
              <button
                type="button"
                onClick={castResetToDefault}
                className="rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold text-secondary-foreground shadow hover:bg-secondary/90 transition-colors"
              >
                Reset to Default
              </button>
            )}
            <div className="relative inline-flex max-w-full">
              <Button
                variant="secondary"
                size="icon"
                className="absolute -right-2 -top-2 z-[81] h-7 w-7 rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                onClick={() => setActionBarOpen(false)}
                aria-label="Dismiss action bar"
              >
                <X className="h-4 w-4" />
              </Button>
              <InstanceActionBar
                slots={actionBarSlots}
                layouts={instanceDefaults?.action_bar_layouts ?? []}
                onCast={castLayout}
                onResetToDefault={castResetToDefault}
                mobileKeypad={isMobile}
              />
            </div>
          </div>
        </div>
      )}

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
            includeWipes={viewState.includeWipes}
            onIncludeWipesChange={setIncludeWipes}
            instanceStartTime={instance.startTime}
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
        
        {instance.encounters.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <Card className="max-w-xl p-6 text-center">
              <p className="text-lg font-semibold">No encounters were parsed for this instance</p>
              <p className="mt-2 text-sm text-muted-foreground">
                The log matched this instance, but it did not produce any finalized encounters. This usually means the log only contains trash, setup activity, or incomplete combat for the zone.
              </p>
            </Card>
          </div>
        ) : selectedEncounters.length > 0 ? (
          <EncounterDetail
            instance={instance}
            encounters={selectedEncounters}
            players={instance.players ?? {}}
            entitySelection={entitySelection}
            layoutItems={activeLayoutItems}
            panelTypesById={panelTypesByID}
            panelOptionsById={panelOptionsByID}
            seedFiltersByID={seedFiltersByID}
            seedFiltersVersion={seedFiltersVersion}
            onPanelTypeChange={handlePanelTypeChangeByID}
            onPanelOptionChange={handlePanelOptionChangeByID}
            onPanelFiltersChange={handlePanelFiltersChange}
            onToggleEnemy={toggleEnemySelection}
            onSelectEnemies={selectEnemies}
            onTogglePlayer={togglePlayerSelection}
            onTogglePlayers={togglePlayersSelection}
            onClearSelection={clearEntitySelection}
            onSelectEncounters={setInternalSelectedIds}
            onExplainerClick={handleExplainerClick}
            showHints={showHints}
            isMobile={isMobile}
            activePresetId={activePresetId}
            layoutPopup={layoutPopup}
            actionBarSlots={actionBarSlots}
            layouts={instanceDefaults?.action_bar_layouts ?? []}
            onPresetChange={applyPreset}
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

      {/* Mobile: spellbook FAB to toggle action bar (logged-in users only) */}
      {isMobile && isLoggedIn && createPortal(
        <Button
          variant="default"
          size="icon"
          onClick={() => {
            setActionBarOpen((prev) => !prev);
            setSidebarOpen(false);
          }}
          className="fixed bottom-8 right-8 z-50 h-14 w-14 rounded-full shadow-lg"
          title={actionBarOpen ? "Close action bar" : "Open action bar"}
        >
          {actionBarOpen ? <X className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </Button>,
        document.body
      )}
    </div>
  );
}
