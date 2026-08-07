/**
 * RolesContent - displays inferred player roles (Tank, Healer, DPS)
 * 
 * This component reuses data from the damage_taken, healing_done, and damage_done processors
 * rather than having its own processor.
 */

import { Shield, Heart, Swords, Loader2 } from "lucide-react";
import type { PanelContext } from "../types";
import { type PlayerRoleData, AlgorithmVersion, TankThreshold } from "../processors";
import type { TankInferenceResult } from "./tankInference";
import { formatNumber } from "@/lib/format";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useInferredRoles } from "./useInferredRoles";

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

/**
 * Debug component: per-player tank evidence table.
 */
function TankEvidenceDebug({ tankEvidence, players }: {
  tankEvidence: TankInferenceResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  players: Record<string, any>;
}) {
  const entries = [...tankEvidence.evidence.entries()]
    .map(([guid, ev]) => ({
      guid,
      name: players[guid]?.name ?? guid,
      ...ev,
    }))
    .sort((a, b) => b.tankScore - a.tankScore);

  if (entries.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer hover:text-foreground" data-roles-tank-evidence-toggle>
        Tank evidence ({entries.filter(e => e.isTank).length} classified)
      </summary>
      <div className="mt-2 overflow-x-auto styled-scrollbar">
        <table className="w-full text-[11px] font-mono" data-roles-tank-evidence>
          <thead>
            <tr className="text-left text-muted-foreground/70 border-b border-border/30">
              <th className="pr-2 pb-1">Player</th>
              <th className="pr-2 pb-1">Score</th>
              <th className="pr-2 pb-1">Source</th>
              <th className="pr-2 pb-1">Att/Max</th>
              <th className="pb-1">Tank</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.guid} className={e.isTank ? "text-amber-400" : "text-foreground"}>
                <td className="pr-2 py-0.5">{e.name}</td>
                <td className="pr-2 py-0.5">{e.tankScore.toFixed(3)}</td>
                <td className="pr-2 py-0.5 max-w-[120px] truncate" title={e.strongestSource?.sourceName}>
                  {e.strongestSource?.sourceName ?? "—"}
                </td>
                <td className="pr-2 py-0.5">
                  {e.strongestSource ? `${e.strongestSource.attempts}/${e.strongestSource.maxAttempts}` : "—"}
                </td>
                <td className="py-0.5">{e.isTank ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface RolesContentProps {
  context: PanelContext;
}

export const RolesContent = ({ context }: RolesContentProps) => {
  const { summary: roleSummary, debug, tankEvidence, loading, processing, error } = useInferredRoles(context);

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
              <div className="col-span-2 mb-1">
                <span className="text-muted-foreground">Algorithm:</span>{" "}
                <span className="text-foreground">Auto Attack attempts v{AlgorithmVersion}</span>
                <span className="text-muted-foreground/70"> · threshold={TankThreshold}</span>
              </div>
              <div>
                <span className="text-emerald-500">Healer cutoff:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.healerCutoff, 0)}</span>
                <span className="text-muted-foreground/70"> healing ≥{debug.healerZThreshold.toFixed(1)}σ</span>
              </div>
              <div>
                <span className="text-red-400">Low DPS cutoff:</span>{" "}
                <span className="text-foreground">{formatNumber(debug.lowDpsCutoff, 0)}</span>
                <span className="text-muted-foreground/70"> damage ≤ bottom {(debug.lowDpsPercentile * 100).toFixed(1)}%</span>
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
        <TankEvidenceDebug tankEvidence={tankEvidence} players={context.instance.players ?? {}} />
      </div>
      </ScrollArea>
    </div>
  );
};
