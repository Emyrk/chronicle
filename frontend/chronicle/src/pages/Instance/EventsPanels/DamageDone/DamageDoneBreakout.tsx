import { useCallback, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AbilityBreakout, type AbilityData, type TargetData, type BreakoutTab } from "@/components/ui/AbilityBreakout";
import type { DamageDoneResult } from "./damageDone.processor";
import type { PanelContext } from "../types";
import type { WoWSpell } from "@/api/wowdb";
import { realSpellId } from "../processors/abilityBreakout";

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
  if (!unitAbilities) return [];

  const abilities: AbilityData[] = [];
  for (const [abilityName, data] of unitAbilities) {
    abilities.push({
      ...data,
      name: abilityName,
      value: data.Total - (data.Absorbed || 0),
      absorbed: data.Absorbed,
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
  if (!unitAbilities) return [];

  const abilities: AbilityDataWithSpellId[] = [];
  for (const [compositeId, data] of unitAbilities) {
    abilities.push({
      ...data,
      name: data.spellName,
      value: data.Total - (data.Absorbed || 0),
      absorbed: data.Absorbed,
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
  if (!unitTargets) return [];
  
  const targets: TargetData[] = [];
  for (const [targetId, value] of unitTargets) {
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
}: UseDamageDoneBreakoutOptions) {
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
        const byAbility = result.ByAbility.get(playerID);
        if (byAbility) {
          for (const [name, data] of byAbility) {
            if (name.includes("(by pet")) {
              abilities.push({
                ...data,
                name,
                value: data.Total - (data.Absorbed || 0),
                absorbed: data.Absorbed,
                spellId: data.spellId,
              });
            }
          }
        }
      } else {
        abilities = getAbilitiesForUnit(result, playerID);
      }
      
      const targets = getTargetsForUnit(result, playerID, context);
      const totalValue = getTotalForUnit(result, playerID);

      // Convert to per-second if needed
      const displayAbilities = perSecond && durationMs
        ? abilities.map((a) => ({
            ...a,
            value: (a.value / durationMs) * 1000,
            absorbed: a.absorbed !== undefined ? (a.absorbed / durationMs) * 1000 : undefined,
          }))
        : abilities;

      const displayTargets = perSecond && durationMs
        ? targets.map((t) => ({
            ...t,
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
          showAbsorbed
          absorbedIsAdditive
        />
      );
    },
    [result, context, valueLabel, perSecond, durationMs, loading, processing, tabByPlayer, showRanks, spellDataMap]
  );

  return breakout;
}
