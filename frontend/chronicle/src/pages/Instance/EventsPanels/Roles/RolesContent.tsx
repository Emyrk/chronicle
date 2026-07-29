/**
 * RolesContent - displays inferred player roles (Tank, Healer, DPS)
 * 
 * This component reuses data from the damage_taken, healing_done, and damage_done processors
 * rather than having its own processor.
 */

import { useMemo } from "react";
import { Shield, Heart, Swords, Loader2 } from "lucide-react";
import type { PanelContext } from "../types";
import { 
  type PlayerRoleData,
  type RoleSummary,
  type RoleDetectionDebug,
  type DamageTakenState,
  type DamageDoneState,
  type UnifiedHealingResult,
  inferRoles, 
  getRoleSummary 
} from "../processors";
import { usePanelAggregation } from "../usePanelAggregation";
import { createDamageTakenPanel } from "../DamageTaken/DamageTaken";
import { createHealingDonePanel } from "../HealingDone/HealingDone";
import { createDamageDonePanel } from "../DamageDone/DamageDone";
import { formatNumber } from "@/lib/format";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";

// WoW class colors (same as PlayerMetricChart)
const CLASS_COLORS: Record<string, string> = {
  WARRIOR: 'var(--color-class-warrior)',
  PALADIN: 'var(--color-class-paladin)',
  HUNTER: 'var(--color-class-hunter)',
  ROGUE: 'var(--color-class-rogue)',
  PRIEST: 'var(--color-class-priest)',
  SHAMAN: 'var(--color-class-shaman)',
  MAGE: 'var(--color-class-mage)',
  WARLOCK: 'var(--color-class-warlock)',
  DRUID: 'var(--color-class-druid)',
  DEATHKNIGHT: 'var(--color-class-deathknight)',
  UNKNOWN: 'var(--color-class-unknown)',
  ENEMY: 'var(--color-class-enemy)',
  CREATURE: 'var(--color-class-creature)',
};

interface RoleGroupProps {
  title: string;
  icon: React.ReactNode;
  players: PlayerRoleData[];
  accentColor: string;
  selectedPlayerIds: Set<string>;
  onTogglePlayers?: (playerIds: string[]) => void;
  onTogglePlayer?: (playerId: string) => void;
  columns?: 1 | 2;
}

function RoleGroup({ title, icon, players, accentColor, selectedPlayerIds, onTogglePlayers, onTogglePlayer, columns = 1 }: RoleGroupProps) {
  // Select all players in this role group
  const handleTitleClick = () => {
    if (!onTogglePlayers || players.length === 0) return;
    onTogglePlayers(players.map(p => p.playerID));
  };

  if (players.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50">
          <span className={accentColor}>{icon}</span>
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground ml-auto">(0)</span>
        </div>
        <div className="text-xs text-muted-foreground italic py-2">
          No {title.toLowerCase()} detected
        </div>
      </div>
    );
  }

  return (
    <div>
      <div 
        className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50 cursor-pointer hover:bg-accent/30 rounded-sm transition-colors"
        onClick={handleTitleClick}
        title={`Select all ${title.toLowerCase()}`}
      >
        <span className={accentColor}>{icon}</span>
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground ml-auto">({players.length})</span>
      </div>
      <div className={columns === 2 ? "grid grid-cols-2 gap-x-2 gap-y-0.5" : "space-y-0.5"}>
        {players.map((player) => {
          const classColor = CLASS_COLORS[player.className] || CLASS_COLORS.UNKNOWN;
          const isSelected = selectedPlayerIds.has(player.playerID);
          return (
            <div 
              key={player.playerID} 
              className="px-2 py-0.5 text-sm cursor-pointer hover:bg-accent/50 rounded-sm transition-colors"
              onClick={() => onTogglePlayer?.(player.playerID)}
            >
              <span 
                className="font-medium"
                style={{ 
                  color: classColor,
                  textShadow: isSelected ? `0 0 8px ${classColor}, 0 0 12px ${classColor}` : undefined,
                }}
              >
                {player.playerName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Class display order (roughly by armor type / role)
const CLASS_ORDER = [
  "WARRIOR", "ROGUE", "HUNTER", 
  "MAGE", "WARLOCK", 
  "PRIEST", "DRUID", "SHAMAN", "PALADIN",
  "UNKNOWN"
];

/**
 * DPS group component - compact flow layout grouped by class
 */
interface DpsGroupProps {
  players: PlayerRoleData[];
  selectedPlayerIds: Set<string>;
  onTogglePlayers?: (playerIds: string[]) => void;
  onTogglePlayer?: (playerId: string) => void;
}

function DpsGroup({ players, selectedPlayerIds, onTogglePlayers, onTogglePlayer }: DpsGroupProps) {
  // Select all DPS players
  const handleTitleClick = () => {
    if (!onTogglePlayers || players.length === 0) return;
    onTogglePlayers(players.map(p => p.playerID));
  };

  if (players.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50">
          <span className="text-red-400"><Swords className="h-4 w-4" /></span>
          <span className="text-sm font-medium">DPS</span>
          <span className="text-xs text-muted-foreground ml-auto">(0)</span>
        </div>
        <div className="text-xs text-muted-foreground italic py-2">
          No DPS detected
        </div>
      </div>
    );
  }
  
  // Group players by class
  const byClass = new Map<string, PlayerRoleData[]>();
  for (const player of players) {
    const cls = player.className || "UNKNOWN";
    if (!byClass.has(cls)) {
      byClass.set(cls, []);
    }
    byClass.get(cls)!.push(player);
  }
  
  // Sort classes by predefined order, then alphabetically for any not in the list
  const sortedClasses = [...byClass.keys()].sort((a, b) => {
    const aIdx = CLASS_ORDER.indexOf(a);
    const bIdx = CLASS_ORDER.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
  
  // Build class groups for rendering
  const classGroups = sortedClasses.map(cls => ({
    className: cls,
    players: byClass.get(cls)!,
    color: CLASS_COLORS[cls] || CLASS_COLORS.UNKNOWN,
  }));
  
  // Select all players of a class
  const handleClassClick = (classPlayers: PlayerRoleData[]) => {
    if (!onTogglePlayers) return;
    onTogglePlayers(classPlayers.map(p => p.playerID));
  };

  return (
    <div>
      <div 
        className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50 cursor-pointer hover:bg-accent/30 rounded-sm transition-colors"
        onClick={handleTitleClick}
        title="Select all DPS"
      >
        <span className="text-red-400"><Swords className="h-4 w-4" /></span>
        <span className="text-sm font-medium">DPS</span>
        <span className="text-xs text-muted-foreground ml-auto">({players.length})</span>
      </div>
      {/* Compact flow layout - class groups wrap naturally */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {classGroups.map(({ className, players: classPlayers, color }) => (
          <div key={className} className="flex items-baseline gap-1">
            <span 
              className="text-xs font-medium capitalize cursor-pointer hover:underline"
              style={{ color }}
              onClick={() => handleClassClick(classPlayers)}
              title={`Select all ${className.toLowerCase()}s`}
            >
              {className.toLowerCase()}:
            </span>
            <span className="text-xs">
              {classPlayers.map((p, idx) => {
                const isSelected = selectedPlayerIds.has(p.playerID);
                return (
                  <span key={p.playerID}>
                    <span
                      className="cursor-pointer hover:underline"
                      style={{ 
                        color,
                        textShadow: isSelected ? `0 0 8px ${color}, 0 0 12px ${color}` : undefined,
                      }}
                      onClick={() => onTogglePlayer?.(p.playerID)}
                    >
                      {p.playerName}
                    </span>
                    {idx < classPlayers.length - 1 && <span style={{ color }}>, </span>}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface RolesContentProps {
  context: PanelContext;
}

interface RoleInferenceResult {
  summary: RoleSummary;
  debug: RoleDetectionDebug;
}

export const RolesContent = ({ context }: RolesContentProps) => {
  // Role inference always uses complete encounter data. Clone the source panels with
  // full-data Sync behavior so the moving Sync cursor cannot rebuild these results.
  const damageTakenPanel = useMemo(
    () => ({ ...createDamageTakenPanel("players"), syncDataMode: "full" as const }),
    [],
  );
  const healingDonePanel = useMemo(
    () => ({ ...createHealingDonePanel("players"), syncDataMode: "full" as const }),
    [],
  );
  const damageDonePanel = useMemo(
    () => ({ ...createDamageDonePanel("players"), syncDataMode: "full" as const }),
    [],
  );
  
  // Create a stable context that doesn't change when player/enemy selection changes
  // This prevents reprocessing - only encounter changes should trigger reprocess
  // Roles are computed across all players/enemies for the selected encounters
  // Use string keys for stable comparison since arrays/objects are compared by reference
  const encounterIdsKey = context.selectedEncounterIds.slice().sort().join(',');
  const instanceId = context.instance.id;
  
  const stableContext = useMemo<PanelContext>(() => ({
    instance: context.instance,
    selectedEncounterIds: context.selectedEncounterIds,
    entitySelection: {
      enemyIds: new Set<string>(), // Always empty - enemy selection shouldn't affect processing
      playerIds: new Set<string>(), // Always empty - player selection shouldn't affect processing
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [instanceId, encounterIdsKey]);
  
  const damageTakenAgg = usePanelAggregation<DamageTakenState>({
    panel: damageTakenPanel,
    context: stableContext,
  });
  
  const healingDoneAgg = usePanelAggregation<UnifiedHealingResult>({
    panel: healingDonePanel,
    context: stableContext,
  });
  
  const damageDoneAgg = usePanelAggregation<DamageDoneState>({
    panel: damageDonePanel,
    context: stableContext,
  });

  const loading = damageTakenAgg.loading || healingDoneAgg.loading || damageDoneAgg.loading;
  const processing = damageTakenAgg.processing || healingDoneAgg.processing || damageDoneAgg.processing;
  const error = damageTakenAgg.error || healingDoneAgg.error || damageDoneAgg.error;

  // Aggregate damage taken from the processor result
  const damageTakenMap = useMemo(() => {
    const result = new Map<string, number>();
    if (!damageTakenAgg.result) return result;
    
    for (const encounterId of context.selectedEncounterIds) {
      const encounterData = damageTakenAgg.result.EncounterDamage.get(encounterId);
      if (!encounterData) continue;
      
      for (const [playerId, data] of encounterData) {
        // Sum damage from all sources
        let totalDamage = 0;
        for (const amount of data.source.values()) {
          totalDamage += amount;
        }
        result.set(playerId, (result.get(playerId) || 0) + totalDamage);
      }
    }
    return result;
  }, [damageTakenAgg.result, context.selectedEncounterIds]);

  // Aggregate healing done (including absorbs) from the processor result.
  // Absorbs must be included so that absorb-heavy healers (e.g. Disc Priest)
  // are correctly detected as healers by inferRoles().
  const healingDoneMap = useMemo(() => {
    const result = new Map<string, number>();
    if (!healingDoneAgg.result) return result;
    
    for (const encounterId of context.selectedEncounterIds) {
      const encounterData = healingDoneAgg.result.EncounterHealingByHealer.get(encounterId);
      if (!encounterData) continue;
      
      for (const [playerId, data] of encounterData) {
        result.set(playerId, (result.get(playerId) || 0) + data.effectiveTotal);
      }
    }

    // Add absorb totals per player (tracked globally, not per-encounter)
    for (const [playerId, abilityMap] of healingDoneAgg.result.HealerByAbilityAbsorbed) {
      let totalAbsorbed = 0;
      for (const amount of abilityMap.values()) {
        totalAbsorbed += amount;
      }
      if (totalAbsorbed > 0) {
        result.set(playerId, (result.get(playerId) || 0) + totalAbsorbed);
      }
    }

    return result;
  }, [healingDoneAgg.result, context.selectedEncounterIds]);

  // Aggregate damage done from the processor result
  const damageDoneMap = useMemo(() => {
    const result = new Map<string, number>();
    if (!damageDoneAgg.result) return result;
    
    for (const encounterId of context.selectedEncounterIds) {
      const encounterData = damageDoneAgg.result.EncounterDamage.get(encounterId);
      if (!encounterData) continue;
      
      for (const [playerId, data] of encounterData) {
        // Sum damage to all targets
        let totalDamage = 0;
        for (const amount of data.target.values()) {
          totalDamage += amount;
        }
        result.set(playerId, (result.get(playerId) || 0) + totalDamage);
      }
    }
    return result;
  }, [damageDoneAgg.result, context.selectedEncounterIds]);

  // Infer roles from aggregated data
  const { summary: roleSummary, debug } = useMemo((): RoleInferenceResult => {
    const emptyDebug: RoleDetectionDebug = {
      tankZThreshold: 0,
      healerZThreshold: 0,
      lowDpsZThreshold: 0,
      healerHighZThreshold: 0,
      meanDamageTaken: 0,
      stdDevDamageTaken: 0,
      meanHealingDone: 0,
      stdDevHealingDone: 0,
      meanDamageDone: 0,
      stdDevDamageDone: 0,
      tankCutoff: 0,
      healerCutoff: 0,
      lowDpsCutoff: 0,
      healerHighCutoff: 0,
    };
    
    if (damageTakenMap.size === 0 && healingDoneMap.size === 0 && damageDoneMap.size === 0) {
      return { summary: { tanks: [], healers: [], dps: [] }, debug: emptyDebug };
    }

    // Build players map from context
    const players: Record<string, { name: string; class: string }> = {};
    for (const [guid, player] of Object.entries(context.instance.players || {})) {
      players[guid] = { name: player.name, class: player.class };
    }

    const { roles, debug: inferDebug } = inferRoles(
      damageTakenMap,
      healingDoneMap,
      damageDoneMap,
      players
    );

    return { summary: getRoleSummary(roles), debug: inferDebug };
  }, [damageTakenMap, healingDoneMap, damageDoneMap, context.instance.players]);

  // Compute totals for summary
  const totalPlayers = roleSummary.tanks.length + roleSummary.healers.length + roleSummary.dps.length;

  if (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Error loading data: {error.message}
      </div>
    );
  }

  if (loading || processing) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">{loading ? "Loading..." : "Processing..."}</span>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <ScrollArea className="h-full pr-3">
      {/* Summary line */}
      <div className="text-xs text-muted-foreground mb-3" data-roles-summary>
        <span className="font-medium text-foreground">{totalPlayers}</span> players detected:{" "}
        <span className="text-amber-500">{roleSummary.tanks.length}</span> tanks,{" "}
        <span className="text-emerald-500">{roleSummary.healers.length}</span> healers,{" "}
        <span className="text-red-400">{roleSummary.dps.length}</span> DPS
      </div>

      {/* Tanks (1/3 width) and Healers (2/3 width, 2-col) layout */}
      <div className="grid grid-cols-1 sm:grid-cols-[3fr_5fr] gap-4 mb-4" data-roles-groups>
        <RoleGroup
          title="Tanks"
          icon={<Shield className="h-4 w-4" />}
          players={roleSummary.tanks}
          accentColor="text-amber-500"
          selectedPlayerIds={context.entitySelection.playerIds}
          onTogglePlayers={context.onTogglePlayers}
          onTogglePlayer={context.onTogglePlayer}
        />
        <RoleGroup
          title="Healers"
          icon={<Heart className="h-4 w-4" />}
          players={roleSummary.healers}
          accentColor="text-emerald-500"
          selectedPlayerIds={context.entitySelection.playerIds}
          onTogglePlayers={context.onTogglePlayers}
          onTogglePlayer={context.onTogglePlayer}
          columns={2}
        />
      </div>

      {/* DPS below */}
      <DpsGroup 
        players={roleSummary.dps} 
        selectedPlayerIds={context.entitySelection.playerIds}
        onTogglePlayers={context.onTogglePlayers}
        onTogglePlayer={context.onTogglePlayer}
      />

      {/* Detection info with debug thresholds */}
      <div className="text-xs text-muted-foreground mt-4 pt-2 border-t border-border/30 pb-2" data-roles-debug>
        <details>
          <summary className="cursor-pointer hover:text-foreground" data-roles-debug-toggle>
            Detection thresholds
          </summary>
          <div className="mt-2 space-y-1 font-mono text-[11px] bg-muted/30 p-2 rounded">
            <div className="grid grid-cols-2 gap-x-4">
              <div>
                <span className="text-amber-500">Tank cutoff:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.tankCutoff, 0)}</span>
                <span className="text-muted-foreground/70"> dmg taken ≥{debug.tankZThreshold.toFixed(1)}σ</span>
              </div>
              <div>
                <span className="text-emerald-500">Healer cutoff:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.healerCutoff, 0)}</span>
                <span className="text-muted-foreground/70"> healing ≥{debug.healerZThreshold.toFixed(1)}σ</span>
              </div>
              <div>
                <span className="text-red-400">Low DPS cutoff:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.lowDpsCutoff, 0)}</span>
                <span className="text-muted-foreground/70"> dps ≤{debug.lowDpsZThreshold.toFixed(2)}σ</span>
              </div>
              <div>
                <span className="text-emerald-500">High healing:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.healerHighCutoff, 0)}</span>
                <span className="text-muted-foreground/70"> ≥{debug.healerHighZThreshold.toFixed(1)}σ</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground italic">Healer = healing above mean + (low DPS OR high healing)</span>
              </div>
              <div>
                <span className="text-muted-foreground">Mean dmg taken:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.meanDamageTaken, 0)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Std dev dmg taken:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.stdDevDamageTaken, 0)}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Mean healing:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.meanHealingDone, 0)}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Std dev healing:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.stdDevHealingDone, 0)}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Mean dps:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.meanDamageDone, 0)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Std dev dps:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.stdDevDamageDone, 0)}</span>
              </div>
            </div>
          </div>
        </details>
      </div>
      </ScrollArea>
    </div>
  );
};
