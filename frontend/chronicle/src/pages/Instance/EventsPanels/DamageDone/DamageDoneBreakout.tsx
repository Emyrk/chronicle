import { useCallback, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { spellQueryOptions } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { AbilityBreakout, type AbilityData, type TargetData, type BreakoutTab } from "@/components/ui/AbilityBreakout";
import type { DamageDoneResult } from "./damageDone.processor";
import type { PanelContext } from "../types";
import type { WoWSpell } from "@/api/wowdb";
import { realSpellId } from "../processors/abilityBreakout";
import { getBreakoutProgressLabel } from "../breakoutProgress";

/**
 * Convert the ByAbility map for a specific unit into AbilityData[] for the breakout.
 * 
 * ByAbility structure: Map<unitId, Map<abilityName, DamageAbilityBreakout>>
 */
function getAbilitiesForUnit(
  result: DamageDoneResult,
  unitId: string
): AbilityData[] {
  const unitAbilities = result.ByAbility.get(unitId);
  const excludedAbilities = result.ExcludedByAbility?.get(unitId);
  if (!unitAbilities && !excludedAbilities) return [];

  const abilityNames = new Set([
    ...(unitAbilities?.keys() ?? []),
    ...(excludedAbilities?.keys() ?? []),
  ]);
  const abilities: AbilityData[] = [];
  for (const abilityName of abilityNames) {
    const data = unitAbilities?.get(abilityName);
    const excluded = excludedAbilities?.get(abilityName);
    abilities.push({
      ...(data ?? {
        Total: 0,
        Count: 0,
        Crits: 0,
        Hits: 0,
        Misses: 0,
        spellId: excluded?.spellId,
      }),
      name: abilityName,
      value: data ? data.Total - (data.Absorbed || 0) : 0,
      absorbed: data?.Absorbed,
      overheal: excluded?.Total,
    });
  }

  return abilities.sort((a, b) => (b.value + (b.absorbed || 0)) - (a.value + (a.absorbed || 0)));
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
  result: DamageDoneResult,
  unitId: string
): AbilityDataWithSpellId[] {
  const unitAbilities = result.ByAbilityBySpellId.get(unitId);
  const excludedAbilities = result.ExcludedByAbilityBySpellId?.get(unitId);
  if (!unitAbilities && !excludedAbilities) return [];

  const compositeIds = new Set([
    ...(unitAbilities?.keys() ?? []),
    ...(excludedAbilities?.keys() ?? []),
  ]);
  const abilities: AbilityDataWithSpellId[] = [];
  for (const compositeId of compositeIds) {
    const data = unitAbilities?.get(compositeId);
    const excluded = excludedAbilities?.get(compositeId);
    abilities.push({
      ...(data ?? {
        Total: 0,
        Count: 0,
        Crits: 0,
        Hits: 0,
        Misses: 0,
        spellName: excluded?.spellName ?? `Spell ${realSpellId(compositeId)}`,
      }),
      name: data?.spellName ?? excluded?.spellName ?? `Spell ${realSpellId(compositeId)}`,
      value: data ? data.Total - (data.Absorbed || 0) : 0,
      absorbed: data?.Absorbed,
      overheal: excluded?.Total,
      spellId: realSpellId(compositeId),
    });
  }

  return abilities.sort((a, b) => (b.value + (b.absorbed || 0)) - (a.value + (a.absorbed || 0)));
}

/**
 * Collect all unique spell IDs from the result for fetching spell data.
 */
function getAllSpellIds(result: DamageDoneResult | undefined): number[] {
  if (!result) return [];
  
  const spellIds = new Set<number>();
  
  for (const unitMap of result.ByAbilityBySpellId.values()) {
    for (const id of unitMap.keys()) spellIds.add(realSpellId(id));
  }
  
  for (const unitMap of result.ExcludedByAbilityBySpellId?.values() ?? []) {
    for (const id of unitMap.keys()) spellIds.add(realSpellId(id));
  }

  return Array.from(spellIds);
}

/**
 * Get the total damage for a unit from the ByAbility map.
 */
function getTotalForUnit(
  result: DamageDoneResult,
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
 * Get target breakdown for a unit from ByTarget.
 */
function getTargetsForUnit(
  result: DamageDoneResult,
  unitId: string,
  context: PanelContext
): TargetData[] {
  const unitTargets = result.ByTarget.get(unitId);
  const excludedTargets = result.ExcludedByTarget?.get(unitId);
  if (!unitTargets && !excludedTargets) return [];

  const targetIds = new Set([
    ...(unitTargets?.keys() ?? []),
    ...(excludedTargets?.keys() ?? []),
  ]);
  const targets: TargetData[] = [];
  for (const targetId of targetIds) {
    const value = unitTargets?.get(targetId) ?? 0;
    // Try to resolve target name from players or units
    // Fall back to GUID if name is unknown or empty
    let targetName: string | undefined;
    if (context.instance.players?.[targetId]?.name) {
      targetName = context.instance.players[targetId].name;
    } else if (context.instance.units?.[targetId]?.name) {
      targetName = context.instance.units[targetId].name;
    }
    
    targets.push({
      targetId,
      targetName: targetName || targetId, // Show GUID if name is unknown
      value,
      overheal: excludedTargets?.get(targetId),
      hitCount: 0, // TODO: Track hit counts per target in processor
      critCount: 0,
    });
  }
  
  return targets.sort((a, b) => b.value - a.value);
}

export interface UseDamageDoneBreakoutOptions {
  result: DamageDoneResult | undefined;
  context: PanelContext;
  /** Label for the value column (e.g., "Damage", "DPS") */
  valueLabel?: string;
  perSecond?: boolean;
  durationMs?: number;
  loading?: boolean;
  processing?: boolean;
  /** When true, shows spells by rank (spell ID) instead of combined by name */
  showRanks?: boolean;
  /** When provided, bypasses spell API queries and uses this map directly (keyed by real spell ID). */
  spellDataOverride?: Map<number, WoWSpell>;
}

/**
 * Hook that creates a breakout function for damage done.
 * Returns a function compatible with PlayerMetricChart's breakout prop.
 */
export function useDamageDoneBreakout({
  result,
  context,
  valueLabel = "Damage",
  perSecond = false,
  durationMs,
  loading = false,
  processing = false,
  showRanks = false,
  spellDataOverride,
}: UseDamageDoneBreakoutOptions) {
  // Track tab selection per player so it persists across reloads
  const datasetId = useDatasetId();
  const [tabByPlayer, setTabByPlayer] = useState<Map<string, BreakoutTab>>(new Map());
  
  // Collect all spell IDs for fetching spell data when showRanks is enabled
  const spellIds = useMemo(() => {
    if (!showRanks || spellDataOverride) return [];
    return getAllSpellIds(result);
  }, [result, showRanks, spellDataOverride]);
  
  // Fetch spell data for all spell IDs (only when showRanks is true and no override)
  const spellQueries = useQueries({
    queries: spellIds.map((id) => ({
      ...spellQueryOptions(id.toString(), datasetId),
      staleTime: Infinity,
      enabled: showRanks && !spellDataOverride,
    })),
  });
  
  // Build spell data lookup map (use override if provided)
  const spellDataMap = useMemo(() => {
    if (spellDataOverride) return spellDataOverride;
    const map = new Map<number, WoWSpell>();
    spellQueries.forEach((query, index) => {
      if (query.data) {
        map.set(spellIds[index], query.data);
      }
    });
    return map;
  }, [spellQueries, spellIds, spellDataOverride]);
  
  const breakout = useCallback(
    (playerID: string, pinned: boolean) => {
      const activeTab = tabByPlayer.get(playerID) ?? 'ability';
      const setActiveTab = (tab: BreakoutTab) => {
        setTabByPlayer(prev => new Map(prev).set(playerID, tab));
      };
      if (!result) {
        const progressLabel = getBreakoutProgressLabel(false, loading, processing);
        if (progressLabel) {
          return (
            <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[300px] min-h-[200px]">
              {progressLabel}
            </div>
          );
        }
        return (
          <p className="text-xs p-2 text-background/60">No breakdown available</p>
        );
      }

      // Choose data source based on showRanks
      let abilities: AbilityData[];
      if (showRanks) {
        const abilitiesWithSpellId = getAbilitiesBySpellIdForUnit(result, playerID);
        // Add spellId for icon/tooltip and rank as subtitle
        abilities = abilitiesWithSpellId.map((a) => {
          const spellData = spellDataMap.get(a.spellId);
          const rank = spellData?.subtext?.["0"]; // enUS locale (e.g., "Rank 7")
          return { 
            ...a, 
            key: `spell-${a.spellId}-${a.name}`,  // Unique key (name includes HoT/DoT suffix)
            spellId: a.spellId,  // Pass spellId for icon/tooltip
            subtitle: rank || undefined,
          };
        });
        // Pet abilities in merged mode are excluded from ByAbilityBySpellId (different
        // pets share spell IDs, e.g. Auto Attack=6603). Pull them from ByAbility instead.
        for (const ability of getAbilitiesForUnit(result, playerID)) {
          if (ability.name.includes("(by pet")) abilities.push(ability);
        }
      } else {
        abilities = getAbilitiesForUnit(result, playerID);
      }
      
      const targets = getTargetsForUnit(result, playerID, context);
      const totalValue = getTotalForUnit(result, playerID);

      const progressLabel = getBreakoutProgressLabel(
        abilities.length > 0 || targets.length > 0 || totalValue > 0,
        loading,
        processing,
      );
      if (progressLabel) {
        return (
          <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[300px] min-h-[200px]">
            {progressLabel}
          </div>
        );
      }

      // Convert to per-second if needed
      const displayAbilities = perSecond && durationMs
        ? abilities.map((a) => ({
            ...a,
            value: (a.value / durationMs) * 1000,
            overheal: a.overheal !== undefined ? (a.overheal / durationMs) * 1000 : undefined,
            absorbed: a.absorbed !== undefined ? (a.absorbed / durationMs) * 1000 : undefined,
          }))
        : abilities;

      const displayTargets = perSecond && durationMs
        ? targets.map((t) => ({
            ...t,
            overheal: t.overheal !== undefined ? (t.overheal / durationMs) * 1000 : undefined,
            value: (t.value / durationMs) * 1000,
          }))
        : targets;

      const displayTotal = perSecond && durationMs
        ? (totalValue / durationMs) * 1000
        : totalValue;

      const displayLabel = perSecond ? "DPS" : valueLabel;

      return (
        <AbilityBreakout
          abilities={displayAbilities}
          targets={displayTargets}
          totalValue={displayTotal}
          valueLabel={displayLabel}
          debugGuid={playerID}
          pinned={pinned}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showOverheal
          stackedLabel="Excluded"
          valueBeforeStacked
          showStackedOnlyWhenExpanded
          showAbsorbed
          absorbedIsAdditive
        />
      );
    },
    [result, context, valueLabel, perSecond, durationMs, loading, processing, tabByPlayer, showRanks, spellDataMap]
  );

  return breakout;
}
