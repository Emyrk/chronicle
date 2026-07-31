import { useCallback, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AbilityBreakout, type AbilityData, type TargetData, type BreakoutTab } from "@/components/ui/AbilityBreakout";
import type { UnifiedHealingResult } from "../processors";
import type { PanelContext } from "../types";
import type { HealingViewMode } from "./HealingDoneContent";
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
  // Choose which ability map to use based on view mode
  const effectiveAbilities = result.HealerByAbility.get(unitId);
  const overhealAbilities = result.HealerByAbilityOverheal.get(unitId);
  const absorbedAbilities = result.HealerByAbilityAbsorbed.get(unitId);
  
  if (viewMode === "overheal") {
    // Only show overhealing — no absorbed column
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
    const totalAbilities = result.HealerByAbilityTotal.get(unitId);
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
    // Get overheal for this ability if it exists
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
  result: UnifiedHealingResult,
  unitId: string,
  viewMode: HealingViewMode
): AbilityDataWithSpellId[] {
  // Choose which ability map to use based on view mode
  const effectiveAbilities = result.HealerByAbilityBySpellId.get(unitId);
  const overhealAbilities = result.HealerByAbilityOverhealBySpellId.get(unitId);
  const absorbedAbilities = result.HealerByAbilityAbsorbedBySpellId.get(unitId);
  
  if (viewMode === "overheal") {
    // Only show overhealing
    if (!overhealAbilities) return [];
    const abilities: AbilityDataWithSpellId[] = [];
    for (const [compositeId, data] of overhealAbilities) {
      abilities.push({
        ...data,
        name: data.spellName,
        value: data.Total,
        spellId: realSpellId(compositeId),
      });
    }
    return abilities.sort((a, b) => b.value - a.value);
  }
  
  if (viewMode === "total") {
    // Use the dedicated total map which counts each event exactly once
    const totalAbilities = result.HealerByAbilityTotalBySpellId.get(unitId);
    if (!totalAbilities) return [];
    
    const abilities: AbilityDataWithSpellId[] = [];
    for (const [compositeId, data] of totalAbilities) {
      abilities.push({
        ...data,
        name: data.spellName,
        value: data.Total,
        absorbed: absorbedAbilities?.get(compositeId),
        spellId: realSpellId(compositeId),
      });
    }
    return abilities.sort((a, b) => b.value - a.value);
  }
  
  // Default: effective - include overheal as separate column
  if (!effectiveAbilities) return [];
  const abilities: AbilityDataWithSpellId[] = [];
  for (const [compositeId, data] of effectiveAbilities) {
    // Get overheal for this composite key if it exists
    const overhealData = overhealAbilities?.get(compositeId);
    abilities.push({
      ...data,
      name: data.spellName,
      value: data.Total,
      overheal: overhealData?.Total,
      absorbed: absorbedAbilities?.get(compositeId),
      spellId: realSpellId(compositeId),
    });
  }
  
  // Also add abilities that only have overheal (no effective healing)
  if (overhealAbilities) {
    for (const [compositeId, data] of overhealAbilities) {
      if (!effectiveAbilities?.has(compositeId)) {
        abilities.push({
          ...data,
          name: data.spellName,
          value: 0,
          overheal: data.Total,
          spellId: realSpellId(compositeId),
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
    ? result.HealerByAbility.get(unitId)
    : viewMode === "overheal"
    ? result.HealerByAbilityOverheal.get(unitId)
    : result.HealerByAbilityTotal.get(unitId);
  
  if (!abilityMap) return 0;
  
  let total = 0;
  for (const data of abilityMap.values()) {
    total += data.Total;
  }
  return total;
}

/**
 * Get target breakdown for a unit from ByTarget.
 * This shows who received healing FROM this unit.
 */
function getTargetsForUnit(
  result: UnifiedHealingResult,
  unitId: string,
  context: PanelContext,
  viewMode: HealingViewMode
): TargetData[] {
  const effectiveTargets = result.HealerByTarget.get(unitId);
  const overhealTargets = result.HealerByTargetOverheal.get(unitId);
  
  if (viewMode === "overheal") {
    if (!overhealTargets) return [];
    const targets: TargetData[] = [];
    for (const [targetId, value] of overhealTargets) {
      const targetName = resolveUnitName(targetId, context);
      targets.push({ targetId, targetName, value, hitCount: 0, critCount: 0 });
    }
    return targets.sort((a, b) => b.value - a.value);
  }
  
  if (viewMode === "total") {
    // Use the dedicated total target map
    const totalTargets = result.HealerByTargetTotal.get(unitId);
    if (!totalTargets) return [];
    
    const targets: TargetData[] = [];
    for (const [targetId, value] of totalTargets) {
      const targetName = resolveUnitName(targetId, context);
      targets.push({ targetId, targetName, value, hitCount: 0, critCount: 0 });
    }
    return targets.sort((a, b) => b.value - a.value);
  }
  
  // Default: effective - include overheal as separate column
  if (!effectiveTargets) return [];
  const targets: TargetData[] = [];
  for (const [targetId, value] of effectiveTargets) {
    const targetName = resolveUnitName(targetId, context);
    const overheal = overhealTargets?.get(targetId);
    targets.push({ targetId, targetName, value, hitCount: 0, critCount: 0, overheal });
  }
  
  // Also add targets that only have overheal (no effective healing)
  if (overhealTargets) {
    for (const [targetId, overheal] of overhealTargets) {
      if (!effectiveTargets.has(targetId)) {
        const targetName = resolveUnitName(targetId, context);
        targets.push({ targetId, targetName, value: 0, hitCount: 0, critCount: 0, overheal });
      }
    }
  }
  
  return targets.sort((a, b) => b.value - a.value);
}

export interface UseHealingDoneBreakoutOptions {
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
 * Collect all unique spell IDs from the result for fetching spell data.
 */
function getAllSpellIds(result: UnifiedHealingResult | undefined): number[] {
  if (!result) return [];
  
  const spellIds = new Set<number>();
  
  for (const healerMap of result.HealerByAbilityBySpellId.values()) {
    for (const id of healerMap.keys()) spellIds.add(realSpellId(id));
  }
  for (const healerMap of result.HealerByAbilityOverhealBySpellId.values()) {
    for (const id of healerMap.keys()) spellIds.add(realSpellId(id));
  }
  for (const healerMap of result.HealerByAbilityTotalBySpellId.values()) {
    for (const id of healerMap.keys()) spellIds.add(realSpellId(id));
  }
  
  return Array.from(spellIds);
}

/**
 * Hook that creates a breakout function for healing done.
 * Returns a function compatible with PlayerMetricChart's breakout prop.
 */
export function useHealingDoneBreakout({
  result,
  context,
  valueLabel = "Healing",
  perSecond = false,
  durationMs,
  loading = false,
  processing = false,
  viewMode = "effective",
  showRanks = false,
}: UseHealingDoneBreakoutOptions) {
  // Track tab selection per player so it persists across reloads
  const [tabByPlayer, setTabByPlayer] = useState<Map<string, BreakoutTab>>(new Map());
  
  // Collect all spell IDs for fetching spell data when showRanks is enabled
  const spellIds = useMemo(() => {
    if (!showRanks) return [];
    return getAllSpellIds(result);
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
        const byAbilityMap = viewMode === "overheal"
          ? result.HealerByAbilityOverheal
          : viewMode === "total"
            ? result.HealerByAbilityTotal
            : result.HealerByAbility;
        const byAbility = byAbilityMap.get(playerID);
        if (byAbility) {
          for (const [name, data] of byAbility) {
            if (name.includes("(by pet")) {
              abilities.push({ ...data, name, value: data.Total, spellId: data.spellId });
            }
          }
        }
      } else {
        abilities = getAbilitiesForUnit(result, playerID, viewMode);
      }
      
      const targets = getTargetsForUnit(result, playerID, context, viewMode);
      const totalValue = getTotalForUnit(result, playerID, viewMode);

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
            value: (t.value / durationMs) * 1000,
            overheal: t.overheal !== undefined ? (t.overheal / durationMs) * 1000 : undefined,
          }))
        : targets;

      const displayTotal = perSecond && durationMs
        ? (totalValue / durationMs) * 1000
        : totalValue;

      const displayLabel = perSecond 
        ? (viewMode === "overheal" ? "OPS" : "HPS") 
        : valueLabel;

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
          targetTabLabel={viewMode === "overheal" ? "Overhealed" : "Healed"}
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
