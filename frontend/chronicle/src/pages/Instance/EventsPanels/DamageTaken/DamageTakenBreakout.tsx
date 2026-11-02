import { useCallback, useState } from "react";
import { AbilityBreakout, type AbilityData, type TargetData, type BreakoutTab } from "@/components/ui/AbilityBreakout";
import type { DamageTakenResult } from "./damageTaken.processor";
import type { PanelContext } from "../types";
/**
 * Convert the ByAbility map for a specific unit into AbilityData[] for the breakout.
 * 
 * ByAbility structure: Map<unitId, Map<abilityName, DamageAbilityBreakout>>
 */
function getAbilitiesForUnit(
  result: DamageTakenResult,
  unitId: string
): AbilityData[] {
  const unitAbilities = result.ByAbility.get(unitId);
  if (!unitAbilities) return [];

  const abilities: AbilityData[] = [];
  for (const [abilityName, data] of unitAbilities) {
    abilities.push({
      ...data,
      name: abilityName,
      value: data.Total,
    });
  }

  return abilities.sort((a, b) => b.value - a.value);
}

/**
 * Ability data with spell ID for rank lookups.
 */
interface AbilityDataWithSpellId extends AbilityData {
  spellId: number;
}

/**
 * Convert the ByAbilityBySpellId map for a specific unit into AbilityData[] for the breakout.
 * Uses spell IDs as keys for "Show ranks" mode.
 */
function getAbilitiesBySpellIdForUnit(
  result: DamageTakenResult,
  unitId: string
): AbilityDataWithSpellId[] {
  const unitAbilities = result.ByAbilityBySpellId.get(unitId);
  if (!unitAbilities) return [];

  const abilities: AbilityDataWithSpellId[] = [];
  for (const [spellId, data] of unitAbilities) {
    abilities.push({
      ...data,
      name: data.spellName,
      value: data.Total,
      spellId,
    });
  }

  return abilities.sort((a, b) => b.value - a.value);
}

/**
 * Get the total damage for a unit from the ByAbility map.
 */
function getTotalForUnit(
  result: DamageTakenResult,
  unitId: string
): number {
  const unitAbilities = result.ByAbility.get(unitId);
  if (!unitAbilities) return 0;

  let total = 0;
  for (const data of unitAbilities.values()) {
    total += data.Total;
  }
  return total;
}

/**
 * Get source breakdown for a unit from BySource.
 * This shows who dealt damage TO this unit.
 */
function getSourcesForUnit(
  result: DamageTakenResult,
  unitId: string,
  context: PanelContext
): TargetData[] {
  const unitSources = result.BySource.get(unitId);
  if (!unitSources) return [];
  
  const sources: TargetData[] = [];
  for (const [sourceId, value] of unitSources) {
    // Try to resolve source name from players or units
    let sourceName = sourceId;
    if (context.instance.players?.[sourceId]) {
      sourceName = context.instance.players[sourceId].name;
    } else if (context.instance.units?.[sourceId]) {
      sourceName = context.instance.units[sourceId].name;
    }
    
    sources.push({
      targetId: sourceId,
      targetName: sourceName,
      value,
      hitCount: 0, // TODO: Track hit counts per source in processor
      critCount: 0,
    });
  }
  
  return sources.sort((a, b) => b.value - a.value);
}

export interface UseDamageTakenBreakoutOptions {
  result: DamageTakenResult | undefined;
  context: PanelContext;
  /** Label for the value column (e.g., "Damage", "DTPS") */
  valueLabel?: string;
  perSecond?: boolean;
  durationMs?: number;
  loading?: boolean;
  processing?: boolean;
  /** When true, shows spells separated by rank (spell ID) instead of combined by name */
  showRanks?: boolean;
}

/**
 * Hook that creates a breakout function for damage taken.
 * Returns a function compatible with PlayerMetricChart's breakout prop.
 */
export function useDamageTakenBreakout({
  result,
  context,
  valueLabel = "Damage",
  perSecond = false,
  durationMs,
  loading = false,
  processing = false,
  showRanks = false,
}: UseDamageTakenBreakoutOptions) {
  // Track tab selection per player so it persists across reloads
  const [tabByUnit, setTabByUnit] = useState<Map<string, BreakoutTab>>(new Map());

  const breakout = useCallback(
    (unitID: string, pinned: boolean) => {
      const activeTab = tabByUnit.get(unitID) ?? 'ability';
      const setActiveTab = (tab: BreakoutTab) => {
        setTabByUnit(prev => new Map(prev).set(unitID, tab));
      };
      if (loading || processing) {
        return (
          <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[300px] min-h-[200px]">
            {loading ? "Loading..." : "Processing..."}
          </div>
        );
      }
      
      if (!result) {
        return (
          <p className="text-xs p-2 text-background/60">No breakdown available</p>
        );
      }

      // Choose data source based on showRanks
      let abilities: AbilityData[];
      if (showRanks) {
        const abilitiesWithSpellId = getAbilitiesBySpellIdForUnit(result, unitID);
        abilities = abilitiesWithSpellId.map((a) => ({
          ...a,
          key: `spell-${a.spellId}`,
          spellId: a.spellId,
          showRank: true,
        }));
      } else {
        abilities = getAbilitiesForUnit(result, unitID);
      }

      const sources = getSourcesForUnit(result, unitID, context);
      const totalValue = getTotalForUnit(result, unitID);

      // Convert to per-second if needed
      const displayAbilities = perSecond && durationMs
        ? abilities.map((a) => ({
            ...a,
            value: (a.value / durationMs) * 1000,
          }))
        : abilities;

      const displaySources = perSecond && durationMs
        ? sources.map((s) => ({
            ...s,
            value: (s.value / durationMs) * 1000,
          }))
        : sources;

      const displayTotal = perSecond && durationMs
        ? (totalValue / durationMs) * 1000
        : totalValue;

      const displayLabel = perSecond ? "DTPS" : valueLabel;

      return (
        <AbilityBreakout
          abilities={displayAbilities}
          targets={displaySources}
          totalValue={displayTotal}
          valueLabel={displayLabel}
          debugGuid={unitID}
          pinned={pinned}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          targetTabLabel="Sources"
        />
      );
    },
    [result, context, valueLabel, perSecond, durationMs, loading, processing, tabByUnit, showRanks]
  );

  return breakout;
}
