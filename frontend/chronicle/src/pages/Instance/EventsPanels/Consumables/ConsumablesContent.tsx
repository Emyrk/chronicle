import { useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import { consumableDisplayName, type ConsumableUse, type ConsumablesResult } from "./consumables.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { formatNumber } from "@/lib/format";

/** A use is uncertain when its item is ambiguous/inferred or it was only seen
 * as an already-active buff at pull. */
function isUncertain(use: ConsumableUse): boolean {
  return use.bestConfidence >= 3 || use.bestConfidence === 0 || use.activeAtPullOnly;
}

interface PlayerConsumableRow {
  name: string;
  itemId: number | null;
  uses: number;
  uncertain: number;
}

interface PlayerAggregate {
  total: number;
  uncertain: number;
  consumables: Map<string, PlayerConsumableRow>;
}

function aggregateByPlayer(result: ConsumablesResult): Map<string, PlayerAggregate> {
  const byPlayer = new Map<string, PlayerAggregate>();
  for (const use of result.uses.values()) {
    let agg = byPlayer.get(use.player);
    if (!agg) {
      agg = { total: 0, uncertain: 0, consumables: new Map() };
      byPlayer.set(use.player, agg);
    }
    const name = consumableDisplayName(use);
    const row = agg.consumables.get(name) ?? { name, itemId: use.itemId, uses: 0, uncertain: 0 };
    row.uses++;
    agg.total++;
    if (isUncertain(use)) {
      row.uncertain++;
      agg.uncertain++;
    }
    if (row.itemId === null && use.itemId !== null) row.itemId = use.itemId;
    agg.consumables.set(name, row);
  }
  return byPlayer;
}

function ConsumablesBreakout({ agg }: { agg: PlayerAggregate }) {
  const rows = [...agg.consumables.values()].sort((a, b) => b.uses - a.uses);
  return (
    <div>
      <div className="flex items-center border-b border-border">
        <span className="px-2 py-1 text-2xs font-medium text-foreground border-b-2 border-foreground">By Consumable</span>
        <span className="text-2xs ml-auto pr-1.5 text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{agg.total}</span> uses
        </span>
      </div>
      <ScrollArea className="max-h-panel">
        <table className="w-full text-xs text-foreground">
          <thead className="sticky top-0 bg-popover">
            <tr className="border-b border-border">
              <th className="text-left py-1.5 px-2 font-medium">Consumable</th>
              <th className="text-right py-1.5 px-2 font-medium">Uses</th>
              <th className="text-right py-1.5 px-2 font-medium">Uncertain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border/10 hover:bg-muted/50">
                <td className="py-1 px-2 max-w-[180px] truncate" title={row.itemId ? `${row.name} (item ${row.itemId})` : row.name}>
                  {row.name}
                </td>
                <td className="text-right py-1 px-2 font-mono">{row.uses}</td>
                <td className={cn("text-right py-1 px-2 font-mono", row.uncertain > 0 ? "text-amber-400" : "text-muted-foreground/40")}>
                  {row.uncertain > 0 ? `~${row.uncertain}` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      <p className="text-2xs px-2 py-1 text-muted-foreground">
        ~ counts are ambiguous, inferred, or only seen active at pull.
      </p>
    </div>
  );
}

type ConsumablesContentProps = PanelRenderProps<ConsumablesResult>;

export const ConsumablesContent = (props: ConsumablesContentProps) => {
  const { result, context } = props;

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.uses instanceof Map && r.uses.size > 0,
    [props.panelContextVersion],
  );

  const byPlayer = useMemo(
    () => (cachedResult ? aggregateByPlayer(cachedResult) : new Map<string, PlayerAggregate>()),
    [cachedResult],
  );

  const chartData: PlayerMetricChartData[] = useMemo(() => {
    const selected = context.entitySelection.playerIds;
    return [...byPlayer.entries()].map(([playerId, agg]) => {
      const player = context.instance.players?.[playerId];
      return {
        playerID: playerId,
        playerName: player?.name ?? playerId,
        className: player?.class ?? "UNKNOWN",
        specialization: "",
        value: agg.total,
        dimmed: selected.size !== 0 && !selected.has(playerId),
      };
    });
  }, [byPlayer, context.instance.players, context.entitySelection.playerIds]);

  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(chartData);
  }, [registerChartData, chartData]);

  const breakout = useCallback(
    (playerID: string) => {
      const agg = byPlayer.get(playerID);
      if (!agg) return <p className="text-xs p-2 text-muted-foreground">No consumable data</p>;
      return <ConsumablesBreakout agg={agg} />;
    },
    [byPlayer],
  );

  const totals = useMemo(() => {
    let total = 0;
    let uncertain = 0;
    for (const agg of byPlayer.values()) {
      total += agg.total;
      uncertain += agg.uncertain;
    }
    return { total, uncertain, unknown: cachedResult?.unknownUseIds.size ?? 0 };
  }, [byPlayer, cachedResult]);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <GenericPanel {...effectiveProps}>
      <div className="text-xs text-muted-foreground">
        Total Uses: <span className="font-medium font-mono text-foreground">{formatNumber(totals.total, 0)}</span>
        {totals.uncertain > 0 && (
          <span className="ml-2 text-amber-400" title="Ambiguous, inferred, or only seen active at pull">
            ~{formatNumber(totals.uncertain, 0)} uncertain
          </span>
        )}
        {totals.unknown > 0 && (
          <span className="ml-2 text-muted-foreground/60" title="Uses Chronicle could not map to a known item">
            {formatNumber(totals.unknown, 0)} unmapped
          </span>
        )}
      </div>
      <PlayerMetricChart
        data={chartData}
        type={"healing"}
        panelTitle="Consumables"
        duration_millis={props.durationMs}
        perSecond={false}
        breakout={breakout}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
};
