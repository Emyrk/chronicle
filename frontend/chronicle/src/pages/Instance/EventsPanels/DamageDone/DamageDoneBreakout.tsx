import { useCallback, useState } from "react";
import { AbilityBreakout, type AbilityData, type TargetData, type BreakoutTab } from "@/components/ui/AbilityBreakout";
import type { DamageDoneResult } from "./damageDone.processor";
import type { PanelContext } from "../types";
import type { WoWSpell } from "@/api/wowdb";
import { realSpellId, type DamageAbilityBreakout, type HitTypeStats } from "../processors/abilityBreakout";
import { getBreakoutProgressLabel } from "../breakoutProgress";

const HIT_OUTCOME_KEYS = [
  "Absorbs",
  "Dodges",
  "Parries",
  "FullResist",
  "Immunes",
  "FullBlocks",
  "Reflects",
  "Glancing",
  "Crushing",
  "Unknown",
] as const;

function mergeHitTypeStats(
  included: HitTypeStats | undefined,
  excluded: HitTypeStats | undefined,
): HitTypeStats | undefined {
  if (!excluded) return included;
  if (!included) return { ...excluded };
  return {
    count: included.count + excluded.count,
    total: included.total + excluded.total,
    min: Math.min(included.min, excluded.min),
    max: Math.max(included.max, excluded.max),
  };
}

/**
 * Keep excluded damage in its own value column, but include its real combat
 * outcomes in hit counts, crit rate, and min/avg/max details.
 */
export function withExcludedHitDetails<T extends DamageAbilityBreakout>(
  included: T,
  excluded: DamageAbilityBreakout | undefined,
): T {
  if (!excluded) return included;

  const combined = {
    ...included,
    Count: included.Count + excluded.Count,
    Crits: included.Crits + excluded.Crits,
    Hits: included.Hits + excluded.Hits,
    Misses: included.Misses + excluded.Misses,
    HitStats: mergeHitTypeStats(included.HitStats, excluded.HitStats),
    CritStats: mergeHitTypeStats(included.CritStats, excluded.CritStats),
    GlancingStats: mergeHitTypeStats(included.GlancingStats, excluded.GlancingStats),
    CrushingStats: mergeHitTypeStats(included.CrushingStats, excluded.CrushingStats),
    AbsorbStats: mergeHitTypeStats(included.AbsorbStats, excluded.AbsorbStats),
  };

  for (const key of HIT_OUTCOME_KEYS) {
    combined[key] = (included[key] ?? 0) + (excluded[key] ?? 0);
  }

  return combined;
}

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
    const included = data ?? {
      Total: 0,
      Count: 0,
      Crits: 0,
      Hits: 0,
      Misses: 0,
      spellId: excluded?.spellId,
    };
    abilities.push({
      ...withExcludedHitDetails(included, excluded),
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
    const included = data ?? {
      Total: 0,
      Count: 0,
      Crits: 0,
      Hits: 0,
      Misses: 0,
      spellName: excluded?.spellName ?? `Spell ${realSpellId(compositeId)}`,
    };
    abilities.push({
      ...withExcludedHitDetails(included, excluded),
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
  /** Optional preloaded spell data used by explainers and fixtures (keyed by real spell ID). */
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
  const [tabByPlayer, setTabByPlayer] = useState<Map<string, BreakoutTab>>(new Map());
  
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
          const spellData = spellDataOverride?.get(a.spellId);
          const rank = spellData?.subtext?.["0"]; // enUS locale (e.g., "Rank 7")
          return { 
            ...a, 
            key: `spell-${a.spellId}-${a.name}`,  // Unique key (name includes HoT/DoT suffix)
            spellId: a.spellId,  // Pass spellId for icon/tooltip
            showRank: true,
            spell: spellData,
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
          alwaysShowTargetStacked
          showAbsorbed
          absorbedIsAdditive
        />
      );
    },
    [result, context, valueLabel, perSecond, durationMs, loading, processing, tabByPlayer, showRanks, spellDataOverride]
  );

  return breakout;
}
