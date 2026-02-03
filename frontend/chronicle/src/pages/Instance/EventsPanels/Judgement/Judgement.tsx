/**
 * Judgement panel - Shows Paladin Judgement uptime on targets.
 * 
 * Shows judgement uptime per target with benefit tracking
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Scale } from "lucide-react";
import type { PanelDefinition, PanelRenderProps, PanelContext } from "../types";
import {
  judgementProcessor,
  type JudgementResult,
  type TargetJudgementStats,
  type JudgementType,
} from "./judgement.processor";
import { unifiedHealingProcessor, type UnifiedHealingResult } from "../processors";
import { usePanelAggregation } from "../usePanelAggregation";
import { GenericPanel } from "../GenericPanel";
import { cn } from "@/lib/utils";
import type { ActivityPeriod } from "@/api/typesGenerated";

/** Display names for judgement types */
const JUDGEMENT_LABELS: Record<JudgementType, string> = {
  light: "Light",
  wisdom: "Wisdom",
  crusader: "Crusader",
  justice: "Justice",
  unknown: "Unknown",
};

/** Short codes for compact display */
const JUDGEMENT_SHORT: Record<JudgementType, string> = {
  light: "JoL",
  wisdom: "JoW",
  crusader: "JotC",
  justice: "JoJ",
  unknown: "?",
};

/** Colors for judgement types */
const JUDGEMENT_COLORS: Record<JudgementType, string> = {
  light: "text-yellow-400",
  wisdom: "text-blue-400",
  crusader: "text-red-400",
  justice: "text-purple-400",
  unknown: "text-gray-400",
};

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * Format uptime as percentage
 */
function formatUptimePercent(uptimeMs: number, totalMs: number): string {
  if (totalMs <= 0) return "0%";
  const percent = (uptimeMs / totalMs) * 100;
  return `${percent.toFixed(1)}%`;
}

/**
 * Format large numbers with K suffix
 */
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Sort columns */
type SortColumn = "name" | "light" | "wisdom" | "crusader";
type SortDirection = "asc" | "desc";

/**
 * Convert targets record to array (no sorting - done in component)
 */
function targetsToArray(targets: Record<string, TargetJudgementStats>): TargetJudgementStats[] {
  return Object.values(targets);
}

/**
 * Calculate total active time in ms from activity periods
 */
function calculateActiveTimeMs(periods: readonly ActivityPeriod[]): number {
  let totalMs = 0;
  for (const period of periods) {
    if (period.start && period.end) {
      const startMs = new Date(period.start.timestamp).getTime();
      const endMs = new Date(period.end.timestamp).getTime();
      totalMs += Math.max(0, endMs - startMs);
    }
  }
  return totalMs;
}

/**
 * Build a map of unit GUID -> total active time (ms) from selected encounters
 */
function buildUnitActiveTimeMap(
  context: PanelContext,
): Map<string, number> {
  const map = new Map<string, number>();
  const selectedIds = new Set(context.selectedEncounterIds);
  
  for (const encounter of context.instance.encounters) {
    if (!selectedIds.has(encounter.id)) continue;
    
    for (const enemy of encounter.enemies ?? []) {
      const existingTime = map.get(enemy.id) ?? 0;
      const periodTime = calculateActiveTimeMs(enemy.periods);
      map.set(enemy.id, existingTime + periodTime);
    }
  }
  
  return map;
}

/**
 * Create the Judgement panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createJudgementPanel(): PanelDefinition<JudgementResult, any> {
  return {
    ...judgementProcessor,
    label: "Judgement",
    icon: <Scale className="h-4 w-4" />,
    supportsPerSecond: false,

    render: (props: PanelRenderProps<JudgementResult>) => {
      return <JudgementContent {...props} />;
    },
  };
}

/**
 * Extract total JoL overheal from healing processor result.
 * Sums overheal for "Judgement of Light" and "Judgement of Light (HoT)" across all healers.
 */
function extractJoLOverheal(healingResult: UnifiedHealingResult | null): number {
  if (!healingResult) return 0;
  
  let totalOverheal = 0;
  
  // HealerByAbilityOverheal is healerID -> abilityName -> DamageAbilityBreakout
  for (const [, abilityMap] of healingResult.HealerByAbilityOverheal) {
    // Check both regular and HoT versions of JoL
    const jolBreakout = abilityMap.get("Judgement of Light");
    if (jolBreakout) {
      totalOverheal += jolBreakout.Total;
    }
    const jolHotBreakout = abilityMap.get("Judgement of Light (HoT)");
    if (jolHotBreakout) {
      totalOverheal += jolHotBreakout.Total;
    }
  }
  
  return totalOverheal;
}

// Healing processor panel definition for aggregation (minimal wrapper)
// Must use id: "healing_done" to match the processor registry
const healingPanel = {
  ...unifiedHealingProcessor,
  id: "healing_done",  // Override to match registry key
  label: "Healing",
  icon: null,
  render: () => null,
};

function JudgementContent(props: PanelRenderProps<JudgementResult>) {
  const { result, context } = props;
  
  // Run the healing processor to get JoL overheal data
  const healingAgg = usePanelAggregation<UnifiedHealingResult>({
    panel: healingPanel,
    context,
  });
  
  // Extract JoL overheal from healing result
  const jolOverheal = useMemo(() => {
    return extractJoLOverheal(healingAgg.result);
  }, [healingAgg.result]);

  // Build unit active time map from selected encounters
  const unitActiveTimeMap = useMemo(() => {
    return buildUnitActiveTimeMap(context);
  }, [context]);

  // Merge finalized targets with active judgements
  const targets = useMemo(() => {
    if (!result) return [];
    
    // Start with finalized targets
    const merged: Record<string, TargetJudgementStats> = { ...result.targets };
    
    // Add uptime from still-active judgements (no fade event received)
    for (const [, active] of result.activeJudgements) {
      // Use the max offset for this judgement's encounter
      const encounterMaxOffset = result.maxOffsetByEncounter.get(active.encounterId) ?? active.startOffsetMs;
      const uptimeMs = encounterMaxOffset - active.startOffsetMs;
      if (uptimeMs <= 0) continue;
      
      let targetStats = merged[active.targetGuid];
      if (!targetStats) {
        targetStats = {
          guid: active.targetGuid,
          name: active.targetName,
          uptimeByType: { light: 0, wisdom: 0, crusader: 0, justice: 0, unknown: 0 },
          totalUptimeMs: 0,
          applications: [],
        };
        merged[active.targetGuid] = targetStats;
      }
      
      targetStats.uptimeByType[active.type] += uptimeMs;
      targetStats.totalUptimeMs += uptimeMs;
      // Add as application with endOffsetMs = encounter's max offset (still active)
      targetStats.applications.push({
        type: active.type,
        targetGuid: active.targetGuid,
        targetName: active.targetName,
        startOffsetMs: active.startOffsetMs,
        endOffsetMs: encounterMaxOffset,
        encounterId: active.encounterId,
      });
    }
    
    return targetsToArray(merged);
  }, [result]);

  const hasData = targets.length > 0;

  return (
    <GenericPanel {...props}>
      {!hasData ? (
        <div className="text-center py-2 text-muted-foreground text-sm">
          No Judgement debuffs found
        </div>
      ) : (
        <TargetsView 
          targets={targets} 
          unitActiveTimeMap={unitActiveTimeMap} 
          jolBenefit={result?.jolBenefit}
          jolOverheal={jolOverheal}
        />
      )}
    </GenericPanel>
  );
}

interface TargetsViewProps {
  targets: TargetJudgementStats[];
  unitActiveTimeMap: Map<string, number>;
  jolBenefit?: { totalHealing: number; byPlayer: Map<string, number> };
  jolOverheal: number;
}

function TargetsView({ targets, unitActiveTimeMap, jolBenefit, jolOverheal }: TargetsViewProps) {
  const [selectedTargetGuid, setSelectedTargetGuid] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("light");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const selectedTarget = selectedTargetGuid
    ? targets.find((t) => t.guid === selectedTargetGuid)
    : null;

  // Sort targets based on current sort state
  const sortedTargets = useMemo(() => {
    const sorted = [...targets].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      
      switch (sortColumn) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "light":
          aVal = a.uptimeByType.light;
          bVal = b.uptimeByType.light;
          break;
        case "wisdom":
          aVal = a.uptimeByType.wisdom;
          bVal = b.uptimeByType.wisdom;
          break;
        case "crusader":
        default:
          aVal = a.uptimeByType.crusader;
          bVal = b.uptimeByType.crusader;
          break;
      }
      
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [targets, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column - default to desc for numbers, asc for name
      setSortColumn(column);
      setSortDirection(column === "name" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 inline ml-0.5" />
      : <ArrowDown className="h-3 w-3 inline ml-0.5" />;
  };

  return (
    <div className="space-y-2">
      {/* JoL Benefit Summary */}
      {jolBenefit && jolBenefit.totalHealing > 0 && (
        <div className="text-xs bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1">
          <span className={JUDGEMENT_COLORS.light}>Judgement of Light</span>
          {" healed for "}
          <span className="font-medium text-green-400">{formatNumber(jolBenefit.totalHealing)}</span>
          {jolOverheal > 0 && (
            <>
              {" "}
              <span className="text-muted-foreground">
                ({formatNumber(jolOverheal)} overheal)
              </span>
            </>
          )}
        </div>
      )}

      {selectedTarget ? (
        <TargetBreakout
          target={selectedTarget}
          activeTimeMs={unitActiveTimeMap.get(selectedTarget.guid) ?? selectedTarget.totalUptimeMs}
          onClose={() => setSelectedTargetGuid(null)}
        />
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{targets.length}</span> targets with judgements
            <span className="mx-1">·</span>
            <span>% uptime</span>
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th 
                    className="text-left py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("name")}
                  >
                    Target<SortIcon column="name" />
                  </th>
                  <th 
                    className="text-center py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("light")}
                  >
                    <span className={JUDGEMENT_COLORS.light} title="Judgement of Light uptime">JoL</span>
                    <SortIcon column="light" />
                  </th>
                  <th 
                    className="text-center py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("wisdom")}
                  >
                    <span className={JUDGEMENT_COLORS.wisdom} title="Judgement of Wisdom uptime">JoW</span>
                    <SortIcon column="wisdom" />
                  </th>
                  <th 
                    className="text-center py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("crusader")}
                  >
                    <span className={JUDGEMENT_COLORS.crusader} title="Judgement of the Crusader uptime">JotC</span>
                    <SortIcon column="crusader" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTargets.map((target) => {
                  // Use unit-specific active time, fallback to uptime if not found
                  const activeTimeMs = unitActiveTimeMap.get(target.guid) ?? target.totalUptimeMs;
                  return (
                    <tr
                      key={target.guid}
                      className="border-b border-border/10 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedTargetGuid(target.guid)}
                    >
                      <td className="py-1 px-2 font-medium text-orange-400 whitespace-nowrap">
                        {target.name}
                      </td>
                      <td className={cn("py-1 px-2 text-center font-mono text-2xs", target.uptimeByType.light > 0 && JUDGEMENT_COLORS.light)}>
                        {target.uptimeByType.light > 0
                          ? formatUptimePercent(target.uptimeByType.light, activeTimeMs)
                          : "—"}
                      </td>
                      <td className={cn("py-1 px-2 text-center font-mono text-2xs", target.uptimeByType.wisdom > 0 && JUDGEMENT_COLORS.wisdom)}>
                        {target.uptimeByType.wisdom > 0
                          ? formatUptimePercent(target.uptimeByType.wisdom, activeTimeMs)
                          : "—"}
                      </td>
                      <td className={cn("py-1 px-2 text-center font-mono text-2xs", target.uptimeByType.crusader > 0 && JUDGEMENT_COLORS.crusader)}>
                        {target.uptimeByType.crusader > 0
                          ? formatUptimePercent(target.uptimeByType.crusader, activeTimeMs)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface TargetBreakoutProps {
  target: TargetJudgementStats;
  activeTimeMs: number;
  onClose: () => void;
}

function TargetBreakout({ target, activeTimeMs, onClose }: TargetBreakoutProps) {
  // Sort applications by start time
  const sortedApps = useMemo(() => {
    return [...target.applications].sort((a, b) => a.startOffsetMs - b.startOffsetMs);
  }, [target.applications]);

  // Group by type for summary
  const byType = useMemo(() => {
    const result: Record<JudgementType, { count: number; totalMs: number }> = {
      light: { count: 0, totalMs: 0 },
      wisdom: { count: 0, totalMs: 0 },
      crusader: { count: 0, totalMs: 0 },
      justice: { count: 0, totalMs: 0 },
      unknown: { count: 0, totalMs: 0 },
    };
    for (const app of sortedApps) {
      const duration = app.endOffsetMs - app.startOffsetMs;
      result[app.type].count++;
      result[app.type].totalMs += duration;
    }
    return result;
  }, [sortedApps]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-orange-400">{target.name}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          ✕ close
        </button>
      </div>

      {/* Type summary */}
      <div className="space-y-1">
        {(["light", "wisdom", "crusader", "justice"] as JudgementType[]).map((type) => {
          const stats = byType[type];
          if (stats.count === 0) return null;
          return (
            <div key={type} className="text-2xs flex items-center gap-2">
              <span className={cn("font-medium", JUDGEMENT_COLORS[type])}>
                {JUDGEMENT_LABELS[type]}
              </span>
              <span className="text-muted-foreground">
                {stats.count} applications
                {" • "}
                {formatUptimePercent(stats.totalMs, activeTimeMs)} uptime
              </span>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="max-h-[200px] overflow-y-auto">
        <table className="w-full text-2xs font-mono">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1 px-2 font-medium">Type</th>
              <th className="text-right py-1 px-2 font-medium">Start</th>
              <th className="text-right py-1 px-2 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {sortedApps.map((app, index) => {
              const duration = app.endOffsetMs - app.startOffsetMs;
              return (
                <tr
                  key={index}
                  className="border-b border-border/10"
                >
                  <td className={cn("py-0.5 px-2", JUDGEMENT_COLORS[app.type])}>
                    {JUDGEMENT_SHORT[app.type]}
                  </td>
                  <td className="py-0.5 px-2 text-right">
                    {formatDuration(app.startOffsetMs)}
                  </td>
                  <td className="py-0.5 px-2 text-right">
                    {formatDuration(duration)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
