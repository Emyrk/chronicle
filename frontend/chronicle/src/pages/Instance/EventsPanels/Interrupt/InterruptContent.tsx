/**
 * Interrupt panel content - renders interrupt metrics per player.
 *
 * Shows who interrupted the most spells, with a focus view for per-spell breakdown.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { ChevronLeft } from "lucide-react";
import { useBreakoutHover } from "@/components/ui/AbilityBreakout/BreakoutHoverContext";
import { RowContextMenu, getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { InterruptResult, InterruptEntityData } from "./interrupt.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const FOCUS_PREFIX = "f:";

function parseFocusFromOption(option: string | null | undefined): string | null {
  if (!option) return null;
  const token = option.split(",").find(t => t.startsWith(FOCUS_PREFIX));
  return token ? token.slice(FOCUS_PREFIX.length) : null;
}

function updatePanelOptionToken(
  current: string | null | undefined,
  prefix: string,
  value: string | null,
): string | null {
  const tokens = current ? current.split(",").filter(t => !t.startsWith(prefix)) : [];
  if (value) tokens.push(`${prefix}${value}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}

// ============================================================================
// Breakout table (focus view)
// ============================================================================

interface InterruptAbilityDisplay {
  name: string;
  extraSpellId: number;
  count: number;
}

function InterruptBreakoutTable({ abilities, total }: { abilities: InterruptAbilityDisplay[]; total: number }) {
  const { hover, setHover, clearHover } = useBreakoutHover();

  if (!abilities || abilities.length === 0) {
    return <p className="text-xs p-2 text-muted-foreground">No ability breakdown available</p>;
  }

  const sorted = [...abilities].sort((a, b) => b.count - a.count);

  return (
    <ScrollArea className="max-h-panel">
      <table className="w-full text-xs text-foreground">
        <thead className="sticky top-0 bg-popover">
          <tr className="border-b border-border">
            <th className="text-left py-1.5 px-2 font-medium">Spell Interrupted</th>
            <th className="text-right py-1.5 px-2 font-medium">Count</th>
            <th className="text-right py-1.5 px-2 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ability) => {
            const percent = total > 0 ? (ability.count / total) * 100 : 0;
            const key = ability.extraSpellId > 0 ? String(ability.extraSpellId) : ability.name;
            const rowHighlight = hover.rowId === ability.name;
            return (
              <tr
                key={key}
                className={cn(
                  "border-b border-border/10 hover:bg-muted/50",
                  rowHighlight && "bg-muted/80",
                )}
                onMouseEnter={() => setHover({ rowId: ability.name, columnId: null })}
                onMouseLeave={() => clearHover()}
              >
                <td className="py-1 px-2 max-w-[150px] truncate" title={ability.name}>
                  {ability.name}
                </td>
                <td className="text-right py-1 px-2 font-mono">{ability.count.toLocaleString()}</td>
                <td className="text-right py-1 px-2 font-mono text-muted-foreground">
                  {percent.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}

// ============================================================================
// Aggregation helpers
// ============================================================================

function aggregateForEncounters(
  result: InterruptResult,
  selectedEncounterIds: string[],
  selectedTargets: Set<string>,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();

  for (const encId of selectedEncounterIds) {
    const entityMap = result.byEntity.get(encId);
    if (!entityMap) continue;

    for (const [entityID, data] of entityMap) {
      const existing = aggregated.get(entityID);
      if (existing) {
        existing.value += data.totalInterrupts;
      } else {
        aggregated.set(entityID, {
          playerID: data.entityID,
          playerName: data.entityName,
          className: data.className,
          specialization: "",
          value: data.totalInterrupts,
          dimmed: selectedTargets.size !== 0 && !selectedTargets.has(entityID),
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

function getEntityInterruptData(
  result: InterruptResult,
  entityID: string,
  selectedEncounterIds: string[],
): InterruptEntityData | null {
  const merged: InterruptEntityData = {
    entityID,
    entityName: "",
    className: "",
    totalInterrupts: 0,
    bySpell: new Map(),
  };

  for (const encId of selectedEncounterIds) {
    const entityMap = result.byEntity.get(encId);
    if (!entityMap) continue;
    const data = entityMap.get(entityID);
    if (!data) continue;

    merged.entityName = data.entityName;
    merged.className = data.className;
    merged.totalInterrupts += data.totalInterrupts;
    for (const [key, spell] of data.bySpell) {
      const existing = merged.bySpell.get(key);
      if (existing) {
        existing.count += spell.count;
      } else {
        merged.bySpell.set(key, { ...spell });
      }
    }
  }

  return merged.totalInterrupts > 0 ? merged : null;
}

// ============================================================================
// Main content component
// ============================================================================

export function InterruptContent(props: PanelRenderProps<InterruptResult>) {
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; playerId: string; playerName: string;
  } | null>(null);

  const focusedPlayerId = useMemo(() => parseFocusFromOption(props.panelOption), [props.panelOption]);
  const setFocusedPlayerId = useCallback((id: string | null) => {
    if (!props.setPanelOption) return;
    props.setPanelOption(updatePanelOptionToken(props.panelOption, FOCUS_PREFIX, id));
  }, [props.setPanelOption, props.panelOption]);

  const { result, context, loading, processing } = props;

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.byEntity instanceof Map && r.byEntity.size > 0,
    [props.panelContextVersion],
  );

  // Aggregate data
  const chartData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(
      cachedResult,
      context.selectedEncounterIds,
      context.entitySelection.playerIds,
    );
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection.playerIds]);

  // Register chart data for cross-panel comparison
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(chartData);
  }, [registerChartData, chartData]);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  const handleRowCtrlClick = useCallback((playerId: string, event: React.MouseEvent) => {
    const playerName = chartData.find(d => d.playerID === playerId)?.playerName ?? playerId;
    setContextMenu({ x: event.clientX, y: event.clientY, playerId, playerName });
  }, [chartData]);

  // ESC key to unfocus
  useEffect(() => {
    if (!focusedPlayerId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedPlayerId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusedPlayerId, setFocusedPlayerId]);

  // Build per-ability data for the focused player
  const focusedPlayer = focusedPlayerId
    ? chartData.find(d => d.playerID === focusedPlayerId)
    : null;

  const focusedAbilityData = useMemo(() => {
    if (!focusedPlayerId || !cachedResult) return null;
    const abilityMap = cachedResult.byAbility.get(focusedPlayerId);
    if (!abilityMap || abilityMap.size === 0) return null;

    const barClassName = focusedPlayer?.className ?? "foreground";
    const data: PlayerMetricChartData[] = [];
    for (const [abilityName, count] of abilityMap) {
      data.push({
        playerID: abilityName,
        playerName: abilityName,
        className: barClassName,
        specialization: "",
        value: count,
      });
    }
    return data.sort((a, b) => b.value - a.value);
  }, [focusedPlayerId, cachedResult, focusedPlayer?.className]);

  // Breakout function
  const breakout = useCallback(
    (playerID: string) => {
      if (loading || processing) {
        return (
          <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[300px] min-h-[200px]">
            {loading ? "Loading..." : "Processing..."}
          </div>
        );
      }
      if (!cachedResult) {
        return <p className="text-xs p-2 text-muted-foreground">No breakdown available</p>;
      }

      const entityData = getEntityInterruptData(
        cachedResult,
        playerID,
        context.selectedEncounterIds,
      );

      if (!entityData) {
        return <p className="text-xs p-2 text-muted-foreground">No interrupt data</p>;
      }

      const abilities: InterruptAbilityDisplay[] = Array.from(entityData.bySpell.values());

      return (
        <div>
          <div className="flex items-center border-b border-border">
            <span className="px-2 py-1 text-2xs font-medium text-foreground border-b-2 border-foreground">
              By Spell
            </span>
            <span className="text-2xs ml-auto pr-1.5 text-muted-foreground">
              Total: <span className="font-medium font-mono text-foreground">{entityData.totalInterrupts}</span> interrupts
            </span>
          </div>
          <InterruptBreakoutTable abilities={abilities} total={entityData.totalInterrupts} />
        </div>
      );
    },
    [cachedResult, context.selectedEncounterIds, loading, processing],
  );

  // Total
  const total = chartData.reduce((sum, d) => sum + d.value, 0);
  const displayTotal = formatNumber(total, 0);

  const supportsInterrupt = props.context.instance.capabilities?.includes("interrupt");

  return (
    <GenericPanel {...effectiveProps}>
      {!supportsInterrupt ? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Interrupts are not supported in this log format.
        </div>
      ) : <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{displayTotal}</span>
        </div>
      </div>
      {/* Focus header with back button */}
      {focusedPlayerId && focusedAbilityData && (
        <div className="flex items-center gap-1.5 mb-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            onClick={() => setFocusedPlayerId(null)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-medium">
            {focusedPlayer?.playerName}
          </span>
        </div>
      )}

      {focusedPlayerId && focusedAbilityData ? (
        <PlayerMetricChart
          data={focusedAbilityData}
          type="healing"
          panelTitle="Ability Breakdown"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      ) : (
        <PlayerMetricChart
          data={chartData}
          type={"healing"}
          panelTitle="Interrupts"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          breakout={breakout}
          onRowCtrlClick={handleRowCtrlClick}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      )}
      {contextMenu && (
        <RowContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          playerName={contextMenu.playerName}
          onFocus={() => { setFocusedPlayerId(contextMenu.playerId); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
          armoryUrl={getArmoryUrl(props.context.instance, contextMenu.playerId)}
        />
      )}
      </>}
    </GenericPanel>
  );
}
