import { useEffect, useMemo } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { UnitDeaths } from "./deaths.processor";
import type { DeathsSummaryResult } from "./deathsSummary.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDeathsBreakout } from "./DeathsBreakout";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { COMPACT_DEATH_SEEK_LEAD_MS, compactDeathRows, formatDeathClock, isCompactDeathsOption } from "./compactDeaths";

/**
 * Aggregate death counts across selected encounters.
 */
function aggregateForEncounters(
  deathsMap: Map<string, UnitDeaths>,
  selectedEncounterIds: string[]
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();

  for (const encounterId of selectedEncounterIds) {
    const encounterData = deathsMap.get(encounterId);
    if (!encounterData) continue;

    for (const [unitId, data] of encounterData) {
      const existing = aggregated.get(unitId);
      if (existing) {
        existing.value += data.deathCount;
      } else {
        aggregated.set(unitId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: "",
          value: data.deathCount,
          dimmed: false,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

type DeathsContentProps = PanelRenderProps<DeathsSummaryResult>;

/** Compact mode: one row per player death (time, victim, killer); a row seeks the replay to just before it. */
function CompactDeaths({ result, context }: { result: DeathsSummaryResult | null; context: DeathsContentProps["context"] }) {
  const sync = useSyncModeContextOptional();
  // Not memoized on `result`: Replay progress updates mutate the same state object.
  const rows = compactDeathRows(result?.PlayerDeathRows ?? [], context.selectedEncounterIds);
  // Times count from the first selected encounter's start, like the Replay strip.
  const startMs = useMemo(() => {
    const selected = new Set(context.selectedEncounterIds);
    const starts = context.instance.encounters
      .filter((encounter) => selected.has(encounter.id))
      .map((encounter) => Date.parse(encounter.start_time))
      .filter(Number.isFinite);
    return starts.length > 0 ? Math.min(...starts) : null;
  }, [context.instance.encounters, context.selectedEncounterIds]) ?? rows[0]?.dateMilli ?? 0;
  const canSeek = Boolean(sync && !sync.readOnly && sync.externalDriver === "none");

  if (rows.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No deaths yet</div>;
  }
  return (
    <div className="styled-scrollbar h-full min-h-0 overflow-y-auto">
      <ul className="flex flex-col">
        {rows.map((row, index) => (
          <li key={`${row.playerID}-${row.dateMilli}-${index}`}>
            <button
              type="button"
              disabled={!canSeek}
              onClick={() => {
                if (!sync) return;
                sync.enable();
                sync.setTimestamp(new Date(row.dateMilli - COMPACT_DEATH_SEEK_LEAD_MS));
                sync.play();
              }}
              title={canSeek ? `Watch ${row.playerName}'s death from 10 s before` : undefined}
              className="flex w-full min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs enabled:hover:bg-muted/60"
            >
              <span className="w-12 shrink-0 font-mono text-2xs text-muted-foreground">{formatDeathClock(row.dateMilli - startMs)}</span>
              <span
                className="min-w-0 max-w-[45%] shrink-0 truncate font-medium"
                style={{ color: `var(--color-class-${row.className.toLowerCase()})` }}
              >
                {row.playerName}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.killerName}>{row.killerName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const DeathsContent = (props: DeathsContentProps) => {
  const { result, context, loading, processing } = props;

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.EncounterDeaths instanceof Map && r.EncounterDeaths.size > 0,
    [props.panelContextVersion]
  );

  const deathsData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(cachedResult.EncounterDeaths, context.selectedEncounterIds);
  }, [cachedResult, context.selectedEncounterIds]);

  // Register chart data for cross-panel comparison
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(deathsData);
  }, [registerChartData, deathsData]);

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Create breakout function for showing killer sources
  const breakout = useDeathsBreakout({
    result: cachedResult,
    context,
    loading: hasData ? false : loading,
    processing: hasData ? false : processing,
  });

  // Compute display total
  const total = deathsData.reduce((sum, d) => sum + d.value, 0);

  if (isCompactDeathsOption(props.panelOption)) {
    return (
      <GenericPanel {...effectiveProps}>
        <CompactDeaths result={cachedResult} context={context} />
      </GenericPanel>
    );
  }

  return (
    <GenericPanel {...effectiveProps}>
      <div className="text-xs text-muted-foreground">
        Total Deaths: <span className="font-medium text-foreground">{total}</span>
      </div>
      <PlayerMetricChart
        data={deathsData}
        type={"damage"} // Use red color scheme for deaths
        panelTitle="Deaths"
        duration_millis={props.durationMs}
        perSecond={false} // Deaths per second doesn't make sense
        breakout={breakout}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
};
