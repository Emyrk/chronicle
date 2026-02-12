import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowLeft, Skull, CheckCircle, ChevronDown, ChevronRight, Clock, PanelLeftClose, PanelLeft, Users, Crown, List, FolderTree, X } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useInstanceViewState, type PanelType } from "@/hooks/useUrlState";
import type { ActivityPeriod, InstancePlayer } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/Collapsible/Collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { Instance, Encounter, EnemyUnit } from "./InstancePage";
import { EventsPanel, type EventsPanelType, type PanelContext, type EntitySelection } from "./EventsPanels";
import { PanelTimingProvider, PanelTimingDisplay, PanelTimingResetter } from "./EventsPanels/PanelTimingContext";

// ============================================================================
// Formatting helpers
// ============================================================================

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

function formatPeriodMoment(moment: { timestamp: string; reason: string } | undefined): string {
  if (!moment) return "N/A";
  const time = new Date(moment.timestamp).toLocaleTimeString();
  return `${time} (${moment.reason})`;
}

function formatPeriodsTooltip(guid: string, periods: readonly ActivityPeriod[]): React.ReactNode {
  return (
    <div className="space-y-2 max-w-xs">
      <div className="font-mono text-xs text-muted-foreground">{guid}</div>
      {(!periods || periods.length === 0) ? (
        <span className="text-muted-foreground">No activity data</span>
      ) : (
        <>
          <div className="font-medium border-b border-border pb-1">
            Activity Periods ({periods.length})
          </div>
          {periods.map((period, idx) => (
            <div key={idx} className="text-xs space-y-0.5">
              <div className="font-medium text-foreground/80">Period {idx + 1}</div>
              <div>Start: {formatPeriodMoment(period.start)}</div>
              <div>End: {formatPeriodMoment(period.end)}</div>
              <div>Last Active: {formatPeriodMoment(period.last_active)}</div>
              <div className={period.slain ? "text-green-400" : "text-red-400"}>
                {period.slain ? "✓ Slain" : "✗ Survived"}
              </div>
            </div>
          ))}
        </>
      )}
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
    kills: encs.filter((e) => e.kill).length,
    wipes: encs.filter((e) => !e.kill).length,
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
}: {
  encounters: Encounter[];
  trashGroups: TrashGroup[];
  selectedIds: string[];
  onSelect: (id: string, mode: 'single' | 'toggle') => void;
  onSelectMany: (ids: string[]) => void;
  onCollapse: () => void;
  isMobile: boolean;
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

  const handleClick = (id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      onSelect(id, 'toggle');
    } else {
      onSelect(id, 'single');
    }
  };

  return (
    <div className={cn(
      "w-64 shrink-0 border-r pr-4 overflow-y-auto styled-scrollbar",
      // Desktop: sticky sidebar that scrolls independently
      !isMobile && "sticky top-4 max-h-[calc(100vh-2rem)]",
      // Mobile: fixed overlay with background
      isMobile && "fixed inset-y-0 left-0 z-50 bg-background border-r shadow-lg pl-4 pt-4"
    )}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Encounters
            {selectedIds.length > 1 && (
              <span className="ml-2 text-xs">({selectedIds.length} selected)</span>
            )}
          </h3>
          <div className="flex gap-1 mt-1.5">
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
            const isWipe = !encounter.kill;
            
            return (
              <button
                key={encounter.id}
                onClick={(e) => handleClick(encounter.id, e)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-all duration-150",
                  isSelected
                    ? "bg-primary/90 text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
                    : "hover:bg-accent/50 hover:translate-x-0.5",
                  isWipe && !isSelected && "opacity-60",
                  !encounter.boss && !isSelected && "text-muted-foreground"
                )}
              >
                {encounter.kill ? (
                  <CheckCircle className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-green-500" : "text-green-500/60")} />
                ) : (
                  <Skull className={cn("h-4 w-4 shrink-0", encounter.boss ? "text-red-500" : "text-red-500/60")} />
                )}
                <span className="truncate flex-1">
                  {encounter.boss ? encounter.name : <span className="italic">{encounter.name}</span>}
                </span>
                <span className={cn("text-xs shrink-0", isSelected ? "opacity-70" : "text-muted-foreground")}>
                  {formatDuration(encounter.start_time, encounter.end_time)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
      <>
      {/* Boss encounters */}
      <div className="space-y-1">
        {bossEncounters.map((encounter) => {
          const isSelected = selectedIds.includes(encounter.id);
          const isWipe = !encounter.kill;
          
          return (
            <button
              key={encounter.id}
              onClick={(e) => handleClick(encounter.id, e)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-all duration-150",
                isSelected
                  ? "bg-primary/90 text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
                  : "hover:bg-accent/50 hover:translate-x-0.5",
                isWipe && !isSelected && "opacity-60"
              )}
            >
              {encounter.kill ? (
                <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <Skull className="h-4 w-4 shrink-0 text-red-500" />
              )}
              <span className="truncate flex-1">{encounter.name}</span>
              <span className={cn("text-xs shrink-0", isSelected ? "opacity-70" : "text-muted-foreground")}>
                {formatDuration(encounter.start_time, encounter.end_time)}
              </span>
            </button>
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
                          <button
                            key={encounter.id}
                            onClick={(e) => handleClick(encounter.id, e)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-all duration-150",
                              isSelected
                                ? "bg-primary/90 text-primary-foreground border-l-2 border-l-primary-foreground/70"
                                : "hover:bg-accent/50 hover:translate-x-0.5 opacity-60"
                            )}
                          >
                            {encounter.kill ? (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            ) : (
                              <Skull className="h-3 w-3 text-red-500" />
                            )}
                            <span className="flex-1">#{idx + 1}</span>
                            <span className={cn("shrink-0", isSelected ? "opacity-70" : "text-muted-foreground")}>
                              {formatDuration(encounter.start_time, encounter.end_time)}
                            </span>
                          </button>
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

// ============================================================================
// EncounterDetail component
// ============================================================================

interface EncounterDetailProps {
  instance: Instance;
  encounters: Encounter[];
  players: Record<string, InstancePlayer>;
  entitySelection: EntitySelection;
  panelTypes: [PanelType, PanelType, PanelType, PanelType];
  onPanelTypeChange: (index: 0 | 1 | 2 | 3, type: PanelType) => void;
  onToggleEnemy: (enemyId: string) => void;
  onSelectEnemies: (enemyIds: string[]) => void;
  onTogglePlayer: (playerId: string) => void;
  onTogglePlayers: (playerIds: string[]) => void;
  onClearSelection: () => void;
  onSelectEncounters: (encounterIds: string[]) => void;
}

function EncounterDetail({ 
  instance,
  encounters,
  players,
  entitySelection,
  panelTypes,
  onPanelTypeChange,
  onToggleEnemy,
  onSelectEnemies,
  onTogglePlayer,
  onTogglePlayers,
  onClearSelection,
  onSelectEncounters,
}: EncounterDetailProps) {
  const isSingle = encounters.length === 1;
  const encounter = encounters[0];
  
  // Panel types from props (managed by parent via URL state)
  // Note: PanelType and EventsPanelType are identical unions, cast for compatibility
  const [eventsPanel1Type, eventsPanel2Type, eventsPanel3Type, eventsPanel4Type] = panelTypes;
  const setEventsPanel1Type = (type: EventsPanelType) => onPanelTypeChange(0, type as PanelType);
  const setEventsPanel2Type = (type: EventsPanelType) => onPanelTypeChange(1, type as PanelType);
  const setEventsPanel3Type = (type: EventsPanelType) => onPanelTypeChange(2, type as PanelType);
  const setEventsPanel4Type = (type: EventsPanelType) => onPanelTypeChange(3, type as PanelType);
  
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
  
  // Build PanelContext for EventsPanels
  const panelContext: PanelContext = {
    instance,
    selectedEncounterIds: encounters.map(e => e.id),
    entitySelection,
    onSelectEncounters,
    onTogglePlayer,
    onTogglePlayers,
  };
  
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
    ? (!encounter.kill ? "(Wipe)" : null)
    : encounters.map(e => e.name).filter((v, i, a) => a.indexOf(v) === i).join(", ");

  return (
    <div className="flex-1 min-w-0">
      {/* Encounter header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {isSingle && (
            encounter.kill ? (
              <CheckCircle className="h-6 w-6 text-green-500" />
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
          <Card className="p-4">
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
                          <Tooltip key={enemy.id}>
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
                            <TooltipContent side="bottom" className="p-3">
                              {formatPeriodsTooltip(enemy.id, enemy.periods)}
                            </TooltipContent>
                          </Tooltip>
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
                          <span 
                            className="text-2xs font-medium cursor-pointer hover:underline"
                            style={{ color: `var(--class-${className.toLowerCase()})` }}
                            onClick={() => onTogglePlayers(classPlayers.map(p => p.guid))}
                            title={`Toggle all ${className.toLowerCase()}s`}
                          >
                            {className.slice(0, 3)}:
                          </span>
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
      {/* Events Panels - 2x2 grid */}
      <PanelTimingProvider panelCount={4}>
        <PanelTimingResetter encounters={encounters} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
          <EventsPanel
            panelType={eventsPanel1Type}
            onPanelTypeChange={setEventsPanel1Type}
            durationMs={totalDurationMs}
            context={panelContext}
            panelIndex={0}
          />
          <EventsPanel
            panelType={eventsPanel2Type}
            onPanelTypeChange={setEventsPanel2Type}
            durationMs={totalDurationMs}
            context={panelContext}
            panelIndex={1}
          />
          <EventsPanel
            panelType={eventsPanel3Type}
            onPanelTypeChange={setEventsPanel3Type}
            durationMs={totalDurationMs}
            context={panelContext}
            panelIndex={2}
          />
          <EventsPanel
            panelType={eventsPanel4Type}
            onPanelTypeChange={setEventsPanel4Type}
            durationMs={totalDurationMs}
            context={panelContext}
            panelIndex={3}
          />
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
}

export function InstancePageView({
  instance,
  selectedEncounterIds: _selectedEncounterIds,
  onSelectEncounters,
  youtubeButton,
}: InstancePageViewProps) {

  
  // Compute all enemies from all encounters (GUID-sorted for stable URL indexing)
  const allMergedEnemies = useMemo(
    () => mergeEnemiesByGuid(instance.encounters),
    [instance.encounters]
  );
  
  // URL-persisted view state (base64 encoded single param)
  const { 
    state: viewState, 
    setEncounters: setUrlEncounterIds, 
    setEnemies: setUrlEnemyIds, 
    setPlayers: setUrlPlayerIds, 
    setPanelType,
    clearEntitySelection,
  } = useInstanceViewState({
    encounters: instance.encounters,
    enemies: allMergedEnemies,
    players: instance.players ?? {},
    defaults: {
      encounterIds: instance.encounters.map(e => e.id),
      panels: ['damage_done', 'healing_done', 'damage_taken', 'enemy_damage_done'],
    },
  });
  
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
  
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  
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
  const toggleEnemySelection = (enemyId: string) => {
    setUrlEnemyIds(prev => {
      const next = new Set(prev);
      if (next.has(enemyId)) {
        next.delete(enemyId);
      } else {
        next.add(enemyId);
      }
      return next;
    });
  };
  
  // Select multiple enemies at once (replaces current selection)
  const selectEnemies = (enemyIds: string[]) => {
    setUrlEnemyIds(new Set(enemyIds));
  };
  
  // Toggle player selection
  const togglePlayerSelection = (playerId: string) => {
    setUrlPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };
  
  // Toggle multiple players at once (if any are selected, deselect all; otherwise select all)
  const togglePlayersSelection = (playerIds: string[]) => {
    setUrlPlayerIds(prev => {
      const next = new Set(prev);
      const anySelected = playerIds.some(id => next.has(id));
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
  };

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

  const selectedEncounters = instance.encounters.filter((e) => selectedIds.includes(e.id));
  const trashGroups = groupTrashEncounters(instance.encounters);

  const totalDuration = instance.endTime
    ? formatDuration(instance.startTime, instance.endTime)
    : null;

  return (
    <div className={cn(
      "container mx-auto py-6",
      // Mobile: minimal padding, full width
      isMobile ? "px-2" : "px-4 max-w-7xl"
    )}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{instance.name}</h1>
            <p className="text-muted-foreground text-sm">
              {instance.realm && `${instance.realm} • `}
              {formatTime(instance.startTime)}
              {totalDuration && ` • ${totalDuration}`}
            </p>
          </div>
          {youtubeButton}
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
            panelTypes={viewState.panels}
            onPanelTypeChange={setPanelType}
            onToggleEnemy={toggleEnemySelection}
            onSelectEnemies={selectEnemies}
            onTogglePlayer={togglePlayerSelection}
            onTogglePlayers={togglePlayersSelection}
            onClearSelection={clearEntitySelection}
            onSelectEncounters={setInternalSelectedIds}
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
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed bottom-8 left-8 z-50 h-14 w-14 rounded-full shadow-lg"
          title={sidebarOpen ? "Close encounters" : "Show encounters"}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
        </Button>,
        document.body
      )}
    </div>
  );
}
