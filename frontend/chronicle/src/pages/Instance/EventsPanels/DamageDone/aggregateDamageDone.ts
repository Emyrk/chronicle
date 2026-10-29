import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { EntitySelection } from "../types";
import type { DamageDoneResult, DamageSourceType } from "./damageDone.processor";

/**
 * Aggregate damage data across selected encounters.
 * Merges per-encounter data into a single map by player.
 * 
 * - If selected.enemyIds is non-empty, only sum damage dealt to those targets
 * - If selected.playerIds is non-empty, dim players not in selection
 */
export function aggregateForEncounters(
  sourceType: DamageSourceType,
  result: DamageDoneResult,
  selectedEncounterIds: string[],
  selected: EntitySelection,
  disableSubjectSelection = false,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();
  
  // Determine which entity set controls the "dimmed" highlight.
  // Target filtering is handled by panel defaultFilters at the processor level.
  let subjects = selected.playerIds;
  if (sourceType === "enemies") {
    subjects = selected.enemyIds;
  }
  const hasSubjectSelection = !disableSubjectSelection && subjects.size > 0;
  
  for (const encounterId of selectedEncounterIds) {
    const encounterDamage = result.EncounterDamage.get(encounterId);
    const encounterExcluded = result.EncounterExcludedDamage?.get(encounterId);
    const playerIds = new Set([
      ...(encounterDamage?.keys() ?? []),
      ...(encounterExcluded?.keys() ?? []),
    ]);

    for (const playerId of playerIds) {
      const data = encounterDamage?.get(playerId) ?? encounterExcluded?.get(playerId);
      if (!data) continue;

      const damageValue = Array.from(encounterDamage?.get(playerId)?.target.values() ?? [])
        .reduce((sum, amount) => sum + amount, 0);
      const excludedValue = Array.from(encounterExcluded?.get(playerId)?.target.values() ?? [])
        .reduce((sum, amount) => sum + amount, 0);
      if (damageValue === 0 && excludedValue === 0) continue;

      const existing = aggregated.get(playerId);
      if (existing) {
        existing.value += damageValue;
        existing.stackedValue = (existing.stackedValue ?? 0) + excludedValue;
      } else {
        aggregated.set(playerId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: data.specialization,
          value: damageValue,
          stackedValue: excludedValue || undefined,
          dimmed: hasSubjectSelection && !subjects.has(playerId),
        });
      }
    }
  }
  
  return Array.from(aggregated.values());
}
