import { useCallback, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AbilityBreakout, type AbilityData, type TargetData, type BreakoutTab } from "@/components/ui/AbilityBreakout";
import type { UnifiedHealingResult } from "../processors";
import type { PanelContext } from "../types";
import type { HealingViewMode } from "./HealingTakenContent";
import type { WoWSpell } from "@/api/wowdb";
import { realSpellId } from "../processors/abilityBreakout";
import { getBreakoutProgressLabel } from "../breakoutProgress";

/**
 * Resolve a unit name from context, formatting pets as "{Owner}'s Pet {PetName}".
 */
function resolveUnitName(unitId: string, context: PanelContext): string {
  // Special "Other" bucket for non-player, non-pet targets
  if (unitId === "__other__") {
    return "Other";
  }
  // Check if it's a player first
  if (context.instance.players?.[unitId]) {
    return context.instance.players[unitId].name;
  }
  // Check if it's a unit (could be a pet)
  const unitInfo = context.instance.units?.[unitId];
  if (unitInfo) {
    // If the unit has a player owner, format as pet
    const ownerKey = unitInfo.owner?.toString();
    if (ownerKey && context.instance.players?.[ownerKey]) {
      const ownerName = context.instance.players[ownerKey].name;
      return `${ownerName}'s Pet ${unitInfo.name}`;
    }
    return unitInfo.name;
  }
  return unitId;
}

/**
 * Convert the ByAbility map for a specific unit into AbilityData[] for the breakout.
 * Uses either effective or overheal data based on view mode.
 */
function getAbilitiesForUnit(
  result: UnifiedHealingResult,
  unitId: string,
  viewMode: HealingViewMode
): AbilityData[] {
  const effectiveAbilities = result.TargetByAbility.get(unitId);
  const overhealAbilities = result.TargetByAbilityOverheal.get(unitId);
  const absorbedAbilities = result.TargetByAbilityAbsorbed.get(unitId);
  
  if (viewMode === "overheal") {
    if (!overhealAbilities) return [];
    const abilities: AbilityData[] = [];
    for (const [abilityName, data] of overhealAbilities) {
      abilities.push({
        ...data,
        name: abilityName,
        value: data.Total,
      });
    }
    return abilities.sort((a, b) => b.value - a.value);
  }
  
  if (viewMode === "total") {
    // Use the dedicated total map which counts each event exactly once
    const totalAbilities = result.TargetByAbilityTotal.get(unitId);
    if (!totalAbilities) return [];
    
    const abilities: AbilityData[] = [];
    for (const [abilityName, data] of totalAbilities) {
      abilities.push({
        ...data,
        name: abilityName,
        value: data.Total,
        absorbed: absorbedAbilities?.get(abilityName),
      });
    }
    return abilities.sort((a, b) => b.value - a.value);
  }
  
  // Default: effective - include overheal as separate column
  if (!effectiveAbilities) return [];
  const abilities: AbilityData[] = [];
  for (const [abilityName, data] of effectiveAbilities) {
    const overhealData = overhealAbilities?.get(abilityName);
    abilities.push({
      ...data,
      name: abilityName,
      value: data.Total,
      overheal: overhealData?.Total,
      absorbed: absorbedAbilities?.get(abilityName),
    });
  }
  
  // Also add abilities that only have overheal (no effective healing)
  if (overhealAbilities) {
    for (const [abilityName, data] of overhealAbilities) {
      if (!effectiveAbilities?.has(abilityName)) {
        abilities.push({
          ...data,
          name: abilityName,
          value: 0,
          overheal: data.Total,
        });
      }
    }
  }

  return abilities.sort((a, b) => b.value - a.value);
}

/**
 * Get the total healing for a unit based on view mode.
 */
function getTotalForUnit(
  result: UnifiedHealingResult,
  unitId: string,
  viewMode: HealingViewMode
): number {
  // Use the appropriate map based on view mode
  const abilityMap = viewMode === "effective" 
    ? result.TargetByAbility.get(unitId)
    : viewMode === "overheal"
    ? result.TargetByAbilityOverheal.get(unitId)
    : result.TargetByAbilityTotal.get(unitId);
  
  if (!abilityMap) return 0;
  
  let total = 0;
  for (const data of abilityMap.values()) {
    total += data.Total;
  }
  return total;
}

/**
 * Get source breakdown for a unit from BySource.
 * This shows who healed this unit (healer breakdown).
 */
function getSourcesForUnit(
  result: UnifiedHealingResult,
  unitId: string,
  context: PanelContext,
  viewMode: HealingViewMode
): TargetData[] {
  const effectiveSources = result.TargetBySource.get(unitId);
  const overhealSources = result.TargetBySourceOverheal.get(unitId);
  
  if (viewMode === "overheal") {
    if (!overhealSources) return [];
    const sources: TargetData[] = [];
    for (const [sourceId, value] of overhealSources) {
      const sourceName = resolveUnitName(sourceId, context);
      sources.push({ targetId: sourceId, targetName: sourceName, value, hitCount: 0, critCount: 0 });
    }
    return sources.sort((a, b) => b.value - a.value);
  }
  
  if (viewMode === "total") {
    // Use the dedicated total source map
    const totalSources = result.TargetBySourceTotal.get(unitId);
    if (!totalSources) return [];
    
    const sources: TargetData[] = [];
    for (const [sourceId, value] of totalSources) {
      const sourceName = resolveUnitName(sourceId, context);
      sources.push({ targetId: sourceId, targetName: sourceName, value, hitCount: 0, critCount: 0 });
    }
    return sources.sort((a, b) => b.value - a.value);
  }
  
  // Default: effective only
  if (!effectiveSources) return [];
  const sources: TargetData[] = [];
  for (const [sourceId, value] of effectiveSources) {
    const sourceName = resolveUnitName(sourceId, context);
    sources.push({ targetId: sourceId, targetName: sourceName, value, hitCount: 0, critCount: 0 });
  }
  return sources.sort((a, b) => b.value - a.value);
}

export interface AbilityDataWithSpellId extends AbilityData {
  spellId: number;
}

/**
 * Get abilities keyed by spell ID for a target unit (for "Show ranks" mode).
 */
export function getAbilitiesBySpellIdForUnit(
  result: UnifiedHealingResult,
  unitId: string,
  viewMode: HealingViewMode
): AbilityDataWithSpellId[] {
  const effectiveAbilities = result.TargetByAbilityBySpellId.get(unitId);
  const overhealAbilities = result.TargetByAbilityOverhealBySpellId.get(unitId);
  const absorbedAbilities = result.TargetByAbilityAbsorbedBySpellId.get(unitId);
  
  if (viewMode === "overheal") {
    if (!overhealAbilities) return [];
    const abilities: AbilityDataWithSpellId[] = [];
    for (const [compositeId, data] of overhealAbilities) {
      abilities.push({ ...data, name: data.spellName, value: data.Total, spellId: realSpellId(compositeId) });
    }
    return abilities.sort((a, b) => b.value - a.value);
  }
  
  if (viewMode === "total") {
    const totalAbilities = result.TargetByAbilityTotalBySpellId.get(unitId);
    if (!totalAbilities) return [];
    const abilities: AbilityDataWithSpellId[] = [];
    for (const [compositeId, data] of totalAbilities) {
      abilities.push({ ...data, name: data.spellName, value: data.Total, absorbed: absorbedAbilities?.get(compositeId), spellId: realSpellId(compositeId) });
    }
    return abilities.sort((a, b) => b.value - a.value);
  }
  
  // Default: effective - include overheal as separate column
  if (!effectiveAbilities) return [];
  const abilities: AbilityDataWithSpellId[] = [];
  for (const [compositeId, data] of effectiveAbilities) {
    const overhealData = overhealAbilities?.get(compositeId);
    abilities.push({ ...data, name: data.spellName, value: data.Total, overheal: overhealData?.Total, absorbed: absorbedAbilities?.get(compositeId), spellId: realSpellId(compositeId) });
  }
  
  if (overhealAbilities) {
    for (const [compositeId, data] of overhealAbilities) {
      if (!effectiveAbilities?.has(compositeId)) {
        abilities.push({ ...data, name: data.spellName, value: 0, overheal: data.Total, spellId: realSpellId(compositeId) });
      }
    }
  }

  return abilities.sort((a, b) => b.value - a.value);
}

/**
 * Collect all unique spell IDs from the target result for fetching spell data.
 */
export function getAllTargetSpellIds(result: UnifiedHealingResult | undefined): number[] {
  if (!result) return [];
  
  const spellIds = new Set<number>();
  
  for (const targetMap of result.TargetByAbilityBySpellId.values()) {
    for (const id of targetMap.keys()) spellIds.add(realSpellId(id));
  }
  for (const targetMap of result.TargetByAbilityOverhealBySpellId.values()) {
    for (const id of targetMap.keys()) spellIds.add(realSpellId(id));
  }
  for (const targetMap of result.TargetByAbilityTotalBySpellId.values()) {
    for (const id of targetMap.keys()) spellIds.add(realSpellId(id));
  }
  
  return Array.from(spellIds);
}

export interface UseHealingTakenBreakoutOptions {
  result: UnifiedHealingResult | undefined;
  context: PanelContext;
  /** Label for the value column (e.g., "Healing", "HPS") */
  valueLabel?: string;
  perSecond?: boolean;
  durationMs?: number;
  loading?: boolean;
  processing?: boolean;
  /** View mode for healing display */
  viewMode?: HealingViewMode;
  /** When true, shows spells by rank (spell ID) instead of combined by name */
  showRanks?: boolean;
}

/**
 * Hook that creates a breakout function for healing taken.
 * Returns a function compatible with PlayerMetricChart's breakout prop.
 */
export function useHealingTakenBreakout({
  result,
  context,
  valueLabel = "Healing",
  perSecond = false,
  durationMs,
  loading = false,
  processing = false,
  viewMode = "effective",
  showRanks = false,
}: UseHealingTakenBreakoutOptions) {
  // Track tab selection per player so it persists across reloads
  const [tabByPlayer, setTabByPlayer] = useState<Map<string, BreakoutTab>>(new Map());
  
  // Collect all spell IDs for fetching spell data when showRanks is enabled
  const spellIds = useMemo(() => {
    if (!showRanks) return [];
    return getAllTargetSpellIds(result);
  }, [result, showRanks]);
  
  // Fetch spell data for all spell IDs (only when showRanks is true)
  const spellQueries = useQueries({
    queries: spellIds.map((id) => ({
      queryKey: ["wowdb", "spell", id.toString()],
      queryFn: async (): Promise<WoWSpell> => {
        const response = await fetch(`/api/v1/wowdb/spell/${id}`);
        if (!response.ok) throw new Error("Spell not found");
        return response.json();
      },
      staleTime: Infinity, // DBC data never changes
      retry: false,
      enabled: showRanks,
    })),
  });
  
  // Build spell data lookup map
  const spellDataMap = useMemo(() => {
    const map = new Map<number, WoWSpell>();
    spellQueries.forEach((query, index) => {
      if (query.data) {
        map.set(spellIds[index], query.data);
      }
    });
    return map;
  }, [spellQueries, spellIds]);
  
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
        const abilitiesWithSpellId = getAbilitiesBySpellIdForUnit(result, playerID, viewMode);
        abilities = abilitiesWithSpellId.map((a) => {
          const spellData = spellDataMap.get(a.spellId);
          const rank = spellData?.subtext?.["0"];
          return {
            ...a,
            key: `spell-${a.spellId}`,
            spellId: a.spellId,
            subtitle: rank || undefined,
          };
        });
      } else {
        abilities = getAbilitiesForUnit(result, playerID, viewMode);
      }
      const sources = getSourcesForUnit(result, playerID, context, viewMode);
      const totalValue = getTotalForUnit(result, playerID, viewMode);

      const progressLabel = getBreakoutProgressLabel(
        abilities.length > 0 || sources.length > 0 || totalValue > 0,
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

      const displaySources = perSecond && durationMs
        ? sources.map((t) => ({
            ...t,
            value: (t.value / durationMs) * 1000,
          }))
        : sources;

      const displayTotal = perSecond && durationMs
        ? (totalValue / durationMs) * 1000
        : totalValue;

      const displayLabel = perSecond 
        ? (viewMode === "overheal" ? "OPS" : "HPS") 
        : valueLabel;

      return (
        <AbilityBreakout
          abilities={displayAbilities}
          targets={displaySources}
          totalValue={displayTotal}
          valueLabel={displayLabel}
          debugGuid={playerID}
          pinned={pinned}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          targetTabLabel={viewMode === "overheal" ? "Overhealed By" : "Healed By"}
          showHits={false}
          showOverheal={viewMode === "effective"}
          showAbsorbed={viewMode !== "overheal"}
        />
      );
    },
    [result, context, valueLabel, perSecond, durationMs, loading, processing, tabByPlayer, viewMode, showRanks, spellDataMap]
  );

  return breakout;
}
