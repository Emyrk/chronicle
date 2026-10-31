/**
 * Resists panel content - shows spell resistance statistics per player.
 *
 * Main view: horizontal bars showing resist rate % per player.
 * Focus view: per-ability breakdown with 25/50/75/100% resist buckets.
 */

import { useCallback, useEffect, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { focusPlayerActions, instanceEntityAttributes, instanceRowEntity } from "@/components/ui/PlayerMetricChart/instanceEntity";
import { EntityActionScope } from "@/components/EntityMenu/EntityMenu";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import type { ResistsResult } from "./resists.processor";
import { extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";
import { useCachedValue } from "@/hooks/useCachedValue";
import { formatNumber } from "@/lib/format";
import { SpellSchoolText } from "@/components/SpellSchoolBadge";

// ── Focus helpers (URL-persisted) ──────────────────────────────────────────

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

// ── School number → name mapping (matches proto School enum) ───────────────

const SCHOOL_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "None",
  2: "Physical",
  3: "Holy",
  4: "Fire",
  5: "Nature",
  6: "Frost",
  7: "Shadow",
  8: "Arcane",
};

// ── Aggregation ────────────────────────────────────────────────────────────

export function hasResistsData(result: unknown): result is ResistsResult {
  return (
    !!result &&
    typeof result === "object" &&
    "EncounterResists" in result &&
    (result as { EncounterResists?: unknown }).EncounterResists instanceof Map &&
    (result as { EncounterResists: Map<unknown, unknown> }).EncounterResists.size > 0
  );
}

interface AggregatedPlayer {
  unitID: string;
  unitName: string;
  className: string;
  specialization: string;
  totalIncoming: number;
  totalResisted: number;
  count: number;
  partialResistCount: number;
  fullResistCount: number;
}

function aggregateForEncounters(
  result: ResistsResult,
  selectedEncounterIds: string[],
  selected: EntitySelection,
): AggregatedPlayer[] {
  const merged = new Map<string, AggregatedPlayer>();
  const hasSelection = selected.playerIds.size > 0;

  for (const encId of selectedEncounterIds) {
    const encounterMap = result.EncounterResists.get(encId);
    if (!encounterMap) continue;
    for (const [unitId, data] of encounterMap) {
      const existing = merged.get(unitId);
      if (existing) {
        existing.totalIncoming += data.totalIncoming;
        existing.totalResisted += data.totalResisted;
        existing.count += data.count;
        existing.partialResistCount += data.partialResistCount;
        existing.fullResistCount += data.fullResistCount;
      } else {
        merged.set(unitId, {
          unitID: data.unitID,
          unitName: data.unitName,
          className: data.className,
          specialization: data.specialization,
          totalIncoming: data.totalIncoming,
          totalResisted: data.totalResisted,
          count: data.count,
          partialResistCount: data.partialResistCount,
          fullResistCount: data.fullResistCount,
        });
      }
    }
  }

  // Filter by unit selection if active.
  if (hasSelection) {
    for (const uid of merged.keys()) {
      if (!selected.playerIds.has(uid)) {
        merged.delete(uid);
      }
    }
  }

  return Array.from(merged.values());
}

// ── Ability row for focus view ─────────────────────────────────────────────

interface AbilityRow {
  abilityName: string;
  school: number;
  totalIncoming: number;
  totalResisted: number;
  resistRate: number;
  count: number;
  partialResistCount: number;
  fullResistCount: number;
  resist25: number;
  resist50: number;
  resist75: number;
  resist100: number;
}

function buildAbilityRows(
  result: ResistsResult,
  unitId: string,
  groupBySchool: boolean,
): AbilityRow[] {
  const abilities = result.ByAbility.get(unitId);
  if (!abilities) return [];

  if (!groupBySchool) {
    const rows: AbilityRow[] = [];
    for (const [name, ab] of abilities) {
      rows.push({
        abilityName: name,
        school: ab.school,
        totalIncoming: ab.totalIncoming,
        totalResisted: ab.totalResisted,
        resistRate: ab.count > 0 ? ((ab.partialResistCount + ab.fullResistCount) / ab.count) * 100 : 0,
        count: ab.count,
        partialResistCount: ab.partialResistCount,
        fullResistCount: ab.fullResistCount,
        resist25: ab.resist25,
        resist50: ab.resist50,
        resist75: ab.resist75,
        resist100: ab.resist100,
      });
    }
    return rows.sort((a, b) => b.totalResisted - a.totalResisted);
  }

  // Group by school
  const bySchool = new Map<number, AbilityRow>();
  for (const ab of abilities.values()) {
    const existing = bySchool.get(ab.school);
    if (existing) {
      existing.totalIncoming += ab.totalIncoming;
      existing.totalResisted += ab.totalResisted;
      existing.count += ab.count;
      existing.partialResistCount += ab.partialResistCount;
      existing.fullResistCount += ab.fullResistCount;
      existing.resist25 += ab.resist25;
      existing.resist50 += ab.resist50;
      existing.resist75 += ab.resist75;
      existing.resist100 += ab.resist100;
    } else {
      bySchool.set(ab.school, {
        abilityName: SCHOOL_NAMES[ab.school] ?? "Unknown",
        school: ab.school,
        totalIncoming: ab.totalIncoming,
        totalResisted: ab.totalResisted,
        resistRate: 0,
        count: ab.count,
        partialResistCount: ab.partialResistCount,
        fullResistCount: ab.fullResistCount,
        resist25: ab.resist25,
        resist50: ab.resist50,
        resist75: ab.resist75,
        resist100: ab.resist100,
      });
    }
  }

  const rows = Array.from(bySchool.values());
  for (const row of rows) {
    row.resistRate = row.count > 0 ? ((row.partialResistCount + row.fullResistCount) / row.count) * 100 : 0;
  }
  return rows.sort((a, b) => b.totalResisted - a.totalResisted);
}

// ── Main component ─────────────────────────────────────────────────────────

export const ResistsContent = (props: PanelRenderProps<ResistsResult>) => {
  const { result, context } = props;

  const focusedPlayerId = useMemo(() => parseFocusFromOption(props.panelOption), [props.panelOption]);
  const setFocusedPlayerId = useCallback((id: string | null) => {
    if (!props.setPanelOption) return;
    props.setPanelOption(updatePanelOptionToken(props.panelOption, FOCUS_PREFIX, id));
  }, [props.setPanelOption, props.panelOption]);

  const grouping = extractGroupingFromPanelOption(props.panelOption, "default");
  const petMode = extractPetModeFromPanelOption(props.panelOption, "individual");

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    hasResistsData,
    [grouping, petMode, props.panelContextVersion],
  );

  const players = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(
      cachedResult,
      context.selectedEncounterIds,
      context.entitySelection,
    );
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection]);

  // Convert to PlayerMetricChartData with resist % as value (0–100).
  const chartData: PlayerMetricChartData[] = useMemo(() => {
    return players
      .map(p => {
        const resistRate = p.count > 0
          ? ((p.partialResistCount + p.fullResistCount) / p.count) * 100
          : 0;
        return {
          playerID: p.unitID,
          playerName: p.unitName,
          className: p.className,
          specialization: p.specialization,
          value: resistRate,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [players]);

  // Register chart data for comparison panel.
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(chartData);
  }, [registerChartData, chartData]);

  // ESC to unfocus.
  useEffect(() => {
    if (!focusedPlayerId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedPlayerId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusedPlayerId, setFocusedPlayerId]);

  // Focus view data.
  const focusedPlayer = focusedPlayerId
    ? players.find(p => p.unitID === focusedPlayerId)
    : null;

  // Group-by-school toggle (persisted in panelOption as "s:1")
  const groupBySchool = useMemo(() => {
    if (!props.panelOption) return false;
    return props.panelOption.split(",").some(t => t === "s:1");
  }, [props.panelOption]);

  const setGroupBySchool = useCallback((on: boolean) => {
    if (!props.setPanelOption) return;
    const tokens = (props.panelOption ?? "").split(",").filter(t => !t.startsWith("s:"));
    if (on) tokens.push("s:1");
    props.setPanelOption(tokens.filter(Boolean).join(",") || null);
  }, [props.setPanelOption, props.panelOption]);

  const abilityRows = useMemo(() => {
    if (!focusedPlayerId || !cachedResult) return [];
    return buildAbilityRows(cachedResult, focusedPlayerId, groupBySchool);
  }, [focusedPlayerId, cachedResult, groupBySchool]);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Summary line for main view.
  const totalResisted = players.reduce((s, p) => s + p.totalResisted, 0);
  const totalIncoming = players.reduce((s, p) => s + p.totalIncoming, 0);
  const overallRate = totalIncoming > 0 ? (totalResisted / totalIncoming * 100).toFixed(1) : "0";

  return (
    <GenericPanel {...effectiveProps}>
      {/* Summary */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">
          {focusedPlayer ? (
            <>
              <span className="font-medium text-foreground" {...instanceEntityAttributes(props.context.instance, focusedPlayer.unitID)}>{focusedPlayer.unitName}</span>
              {" — "}
              {formatNumber(focusedPlayer.totalResisted, 0)} resisted of {formatNumber(focusedPlayer.totalIncoming, 0)} incoming
            </>
          ) : (
            <>
              Resist rate:{" "}
              <span className="font-medium font-mono text-foreground">{overallRate}%</span>
              {" "}
              ({formatNumber(totalResisted, 0)} of {formatNumber(totalIncoming, 0)})
            </>
          )}
        </div>
      </div>

      {/* Focus header */}
      {focusedPlayerId && abilityRows.length > 0 && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
              onClick={() => setFocusedPlayerId(null)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <span className="text-xs font-medium" {...instanceEntityAttributes(props.context.instance, focusedPlayerId)}>
              {focusedPlayer?.unitName} — {groupBySchool ? "By School" : "By Ability"}
            </span>
          </div>
          <button
            className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
            onClick={() => setGroupBySchool(!groupBySchool)}
          >
            {groupBySchool ? "By Ability" : "By School"}
          </button>
        </div>
      )}

      {focusedPlayerId && abilityRows.length > 0 ? (
        <AbilityBreakoutTable rows={abilityRows} />
      ) : (
        <EntityActionScope actions={focusPlayerActions(setFocusedPlayerId)}>
          <PlayerMetricChart
            data={chartData}
            type="damage"
            panelTitle="Resists"
            valueSuffix="%"
            rowEntity={instanceRowEntity(props.context.instance)}
            disableInteractions={props.context.renderMode === "layout_lab"}
            breakout={(playerId, _pinned) => {
              const p = players.find(d => d.unitID === playerId);
              if (!p) return null;
              // Show per-ability breakdown in the hover tooltip
              const rows = cachedResult ? buildAbilityRows(cachedResult, playerId, false) : [];
              return (
                <div className="p-2 text-xs space-y-1.5 min-w-[240px]">
                  <div className="font-medium" {...instanceEntityAttributes(props.context.instance, playerId)}>{p.unitName}</div>
                  <div className="text-muted-foreground">
                    Count: {p.count} | Partial: {p.partialResistCount} | Full: {p.fullResistCount}
                  </div>
                  <div className="text-muted-foreground">
                    Resisted: {formatNumber(p.totalResisted, 0)} of {formatNumber(p.totalIncoming, 0)}
                  </div>
                  {rows.length > 0 && (
                    <table className="w-full mt-1 border-t border-border/30 pt-1">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left pr-2 font-medium">Ability</th>
                          <th className="text-right px-1 font-medium">Resisted</th>
                          <th className="text-right pl-1 font-medium">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 8).map(row => (
                          <tr key={row.abilityName}>
                            <td className="pr-2">
                              <span>{row.abilityName}</span>
                              {" "}
                              <SpellSchoolText school={SCHOOL_NAMES[row.school] ?? "Unknown"} className="text-[10px] opacity-70" />
                            </td>
                            <td className="text-right px-1 font-mono text-orange-400">{formatNumber(row.totalResisted, 0)}</td>
                            <td className="text-right pl-1 font-mono">{row.resistRate.toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            }}
          />
        </EntityActionScope>
      )}

    </GenericPanel>
  );
};

// ── Ability table for focus view ───────────────────────────────────────────

function AbilityBreakoutTable({ rows }: { rows: AbilityRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50">
            <th className="text-left py-1 pr-2 font-medium">Ability</th>
            <th className="text-right px-1 font-medium" title="Damage dealt to player">Taken</th>
            <th className="text-right px-1 font-medium" title="Damage resisted">Resisted</th>
            <th className="text-right px-1 font-medium" title="Resist rate %">%</th>
            <th className="text-right px-1 font-medium" title="Total resistable events">Count</th>
            <th className="text-right px-1 font-medium" title="Partial resists">PR</th>
            <th className="text-right px-1 font-medium" title="Full resists (100%)">FR</th>
            <th className="text-center px-1 font-medium border-l border-border/30" title="25% resist bucket">25%</th>
            <th className="text-center px-1 font-medium" title="50% resist bucket">50%</th>
            <th className="text-center px-1 font-medium" title="75% resist bucket">75%</th>
            <th className="text-center px-1 font-medium" title="100% resist bucket (full)">100%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const schoolName = SCHOOL_NAMES[row.school] ?? "Unknown";
            return (
              <tr key={row.abilityName} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{row.abilityName}</span>
                    <SpellSchoolText school={schoolName} className="text-[10px] opacity-70" />
                  </div>
                </td>
                <td className="text-right px-1 font-mono">{formatNumber(row.totalIncoming, 0)}</td>
                <td className="text-right px-1 font-mono text-orange-400">{formatNumber(row.totalResisted, 0)}</td>
                <td className="text-right px-1 font-mono">{row.resistRate.toFixed(1)}</td>
                <td className="text-right px-1 font-mono">{row.count}</td>
                <td className="text-right px-1 font-mono">{row.partialResistCount}</td>
                <td className="text-right px-1 font-mono">{row.fullResistCount}</td>
                <td className="text-center px-1 font-mono border-l border-border/30">{row.resist25 || "—"}</td>
                <td className="text-center px-1 font-mono">{row.resist50 || "—"}</td>
                <td className="text-center px-1 font-mono">{row.resist75 || "—"}</td>
                <td className="text-center px-1 font-mono">{row.resist100 || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
