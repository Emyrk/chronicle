import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import type { DeathsSummaryResult } from "./deathsSummary.processor";
import type { PanelContext } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * Killer data for display in the deaths breakout table.
 */
interface KillerDisplay {
  killerID: string;
  killerName: string;
  count: number;
}

// ============================================================================
// Killer Table
// ============================================================================

interface KillerTableProps {
  killers: KillerDisplay[];
  totalDeaths: number;
}

/**
 * Table showing killer-by-killer breakdown.
 * @internal - Not exported, only used within breakout
 */
// eslint-disable-next-line react-refresh/only-export-components
function KillerTable({ killers, totalDeaths }: KillerTableProps) {
  if (!killers || killers.length === 0) {
    return <p className="text-xs p-2 text-muted-foreground">No killer breakdown available</p>;
  }

  // Sort by count descending
  const sorted = [...killers].sort((a, b) => b.count - a.count);

  return (
    <ScrollArea className="max-h-panel">
      <table className="w-full text-xs text-foreground">
        <thead className="sticky top-0 bg-popover">
          <tr className="border-b border-border">
            <th className="text-left py-1.5 px-2 font-medium">Killed By</th>
            <th className="text-right py-1.5 px-2 font-medium">Deaths</th>
            <th className="text-right py-1.5 px-2 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((killer) => {
            const percent = totalDeaths > 0 ? (killer.count / totalDeaths) * 100 : 0;

            return (
              <tr key={killer.killerID} className="border-b border-border/10 hover:bg-muted/50">
                <td className="py-1 px-2 max-w-[180px] truncate" title={killer.killerName}>
                  {killer.killerName}
                </td>
                <td className="text-right py-1 px-2 font-mono">
                  {killer.count.toLocaleString()}
                </td>
                <td className="text-right py-1 px-2 font-mono text-muted-foreground">
                  {percent.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border">
          <tr className="font-medium">
            <td className="py-1 px-2">Total</td>
            <td className="text-right py-1 px-2 font-mono">{totalDeaths.toLocaleString()}</td>
            <td className="text-right py-1 px-2 font-mono text-muted-foreground">100%</td>
          </tr>
        </tfoot>
      </table>
    </ScrollArea>
  );
}

// ============================================================================
// Breakout Component
// ============================================================================

interface DeathsBreakoutProps {
  killers: KillerDisplay[];
  totalDeaths: number;
}

/**
 * Breakout panel for deaths showing killer breakdown.
 * @internal - Not exported, only used within hook
 */
// eslint-disable-next-line react-refresh/only-export-components
function DeathsBreakout({ killers, totalDeaths }: DeathsBreakoutProps) {
  const tabClass = "px-2 py-1 text-2xs font-medium transition-colors";
  const activeTabClass = "text-foreground border-b-2 border-foreground";

  return (
    <div>
      <div className="flex items-center border-b border-border">
        <span className={cn(tabClass, activeTabClass)}>Killed By</span>
        <span className="text-2xs ml-auto pr-1.5 text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{totalDeaths}</span> deaths
        </span>
      </div>
      <KillerTable killers={killers} totalDeaths={totalDeaths} />
    </div>
  );
}

// ============================================================================
// Hook
// ============================================================================

type DeathMode = "players" | "enemies";

/**
 * Get the aggregated death data for a unit across selected encounters.
 */
function getDeathsForUnit(
  result: DeathsSummaryResult,
  unitID: string,
  selectedEncounterIds: string[],
  mode: DeathMode
): { killers: KillerDisplay[]; totalDeaths: number } | null {
  // Aggregate killers across encounters
  const aggregatedKillers = new Map<string, { killerName: string; count: number }>();
  let totalDeaths = 0;

  const deathsMap = mode === "players" ? result.EncounterDeaths : result.EncounterEnemyDeaths;

  for (const encounterId of selectedEncounterIds) {
    const encounterData = deathsMap.get(encounterId);
    if (!encounterData) continue;

    const unitData = encounterData.get(unitID);
    if (!unitData) continue;

    totalDeaths += unitData.deathCount;

    for (const [killerID, killerData] of unitData.killers) {
      const existing = aggregatedKillers.get(killerID) || { killerName: killerData.killerName, count: 0 };
      existing.count += killerData.count;
      aggregatedKillers.set(killerID, existing);
    }
  }

  if (totalDeaths === 0) return null;

  const killers: KillerDisplay[] = Array.from(aggregatedKillers.entries()).map(
    ([killerID, data]) => ({
      killerID,
      killerName: data.killerName,
      count: data.count,
    })
  );

  return { killers, totalDeaths };
}

export interface UseDeathsBreakoutOptions {
  result: DeathsSummaryResult | undefined;
  context: PanelContext;
  loading?: boolean;
  processing?: boolean;
  mode?: DeathMode;
}

/**
 * Hook that creates a breakout function for deaths.
 * Returns a function compatible with PlayerMetricChart's breakout prop.
 */
export function useDeathsBreakout({
  result,
  context,
  loading = false,
  processing = false,
  mode = "players",
}: UseDeathsBreakoutOptions) {
  const breakout = useCallback(
    (unitID: string) => {
      if (loading || processing) {
        return (
          <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[250px] min-h-[150px]">
            {loading ? "Loading..." : "Processing..."}
          </div>
        );
      }

      if (!result) {
        return (
          <p className="text-xs p-2 text-muted-foreground">No breakdown available</p>
        );
      }

      const unitData = getDeathsForUnit(
        result,
        unitID,
        context.selectedEncounterIds,
        mode
      );

      if (!unitData) {
        return (
          <p className="text-xs p-2 text-muted-foreground">No death data</p>
        );
      }

      return (
        <DeathsBreakout
          killers={unitData.killers}
          totalDeaths={unitData.totalDeaths}
        />
      );
    },
    [result, context.selectedEncounterIds, loading, processing, mode]
  );

  return breakout;
}
