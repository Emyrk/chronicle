import { useCallback, useState } from "react";
import { AbilityBreakout, type AbilityData, type BreakoutTab, type TargetData } from "@/components/ui/AbilityBreakout";
import type { PanelContext } from "../types";
import type { AbsorbedDamageResult } from "./absorbedDamage.processor";

const UNKNOWN_SOURCE_ID = "__unknown__";

export interface AbsorbedDamageBreakoutData {
  abilities: AbilityData[];
  sources: TargetData[];
  totalValue: number;
}

function resolveSourceName(sourceId: string, context: PanelContext): string {
  if (sourceId === UNKNOWN_SOURCE_ID) return "Unknown";
  return context.instance.players?.[sourceId]?.name
    ?? context.instance.units?.[sourceId]?.name
    ?? sourceId;
}

export function buildAbsorbedDamageBreakoutData(
  result: AbsorbedDamageResult,
  unitId: string,
  selectedEncounterIds: string[],
  totalValue: number,
  context: PanelContext,
): AbsorbedDamageBreakoutData {
  const abilitiesByName = new Map<string, { amount: number; count: number; spellId: number | null }>();
  const sourcesById = new Map<string, number>();

  for (const encounterId of selectedEncounterIds) {
    const attribution = result.EncounterAttribution.get(encounterId)?.get(unitId);
    if (!attribution) continue;

    for (const [abilityName, ability] of attribution.byAbility) {
      const existing = abilitiesByName.get(abilityName) || { amount: 0, count: 0, spellId: ability.spellId };
      existing.amount += ability.amount;
      existing.count += ability.count;
      if (existing.spellId == null) existing.spellId = ability.spellId;
      abilitiesByName.set(abilityName, existing);
    }

    for (const [sourceId, amount] of attribution.bySource) {
      sourcesById.set(sourceId, (sourcesById.get(sourceId) || 0) + amount);
    }
  }

  const attributedByAbility = Array.from(abilitiesByName.values()).reduce((sum, ability) => sum + ability.amount, 0);
  const unattributedAbility = Math.max(0, totalValue - attributedByAbility);
  if (unattributedAbility > 0) {
    const unknown = abilitiesByName.get("Unknown") || { amount: 0, count: 0, spellId: null };
    unknown.amount += unattributedAbility;
    abilitiesByName.set("Unknown", unknown);
  }

  const attributedBySource = Array.from(sourcesById.values()).reduce((sum, amount) => sum + amount, 0);
  const unattributedSource = Math.max(0, totalValue - attributedBySource);
  if (unattributedSource > 0) {
    sourcesById.set(UNKNOWN_SOURCE_ID, (sourcesById.get(UNKNOWN_SOURCE_ID) || 0) + unattributedSource);
  }

  const abilities: AbilityData[] = Array.from(abilitiesByName, ([name, ability]) => ({
    name,
    value: ability.amount,
    Total: ability.amount,
    Count: ability.count,
    Crits: 0,
    Hits: 0,
    Misses: 0,
    spellId: ability.spellId ?? undefined,
  })).sort((a, b) => b.value - a.value);

  const sources: TargetData[] = Array.from(sourcesById, ([sourceId, value]) => ({
    targetId: sourceId,
    targetName: resolveSourceName(sourceId, context),
    value,
    hitCount: 0,
    critCount: 0,
  })).sort((a, b) => b.value - a.value);

  return { abilities, sources, totalValue };
}

interface UseAbsorbedDamageBreakoutOptions {
  result: AbsorbedDamageResult | undefined;
  context: PanelContext;
  selectedEncounterIds: string[];
  totalsByUnit: Map<string, number>;
  perSecond?: boolean;
  durationMs?: number;
  loading?: boolean;
  processing?: boolean;
}

export function useAbsorbedDamageBreakout({
  result,
  context,
  selectedEncounterIds,
  totalsByUnit,
  perSecond = false,
  durationMs,
  loading = false,
  processing = false,
}: UseAbsorbedDamageBreakoutOptions) {
  const [tabByUnit, setTabByUnit] = useState<Map<string, BreakoutTab>>(new Map());

  return useCallback((unitId: string, pinned: boolean) => {
    if (loading || processing) {
      return (
        <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[300px] min-h-[200px]">
          {loading ? "Loading..." : "Processing..."}
        </div>
      );
    }

    if (!result) {
      return <p className="text-xs p-2 text-muted-foreground">No breakdown available</p>;
    }

    const breakout = buildAbsorbedDamageBreakoutData(
      result,
      unitId,
      selectedEncounterIds,
      totalsByUnit.get(unitId) || 0,
      context,
    );
    const divisor = perSecond && durationMs ? durationMs / 1000 : 1;
    const activeTab = tabByUnit.get(unitId) ?? "ability";

    return (
      <AbilityBreakout
        abilities={breakout.abilities.map(ability => ({
          ...ability,
          value: ability.value / divisor,
          Total: ability.Total / divisor,
        }))}
        targets={breakout.sources.map(source => ({ ...source, value: source.value / divisor }))}
        totalValue={breakout.totalValue / divisor}
        valueLabel={perSecond ? "APS" : "Absorbed"}
        debugGuid={unitId}
        pinned={pinned}
        activeTab={activeTab}
        onTabChange={tab => setTabByUnit(previous => new Map(previous).set(unitId, tab))}
        targetTabLabel="Sources"
        showHits={false}
      />
    );
  }, [context, durationMs, loading, perSecond, processing, result, selectedEncounterIds, tabByUnit, totalsByUnit]);
}
