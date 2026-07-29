import { useMemo } from "react";
import type { PanelContext } from "../types";
import {
  type DamageDoneState,
  type DamageTakenState,
  type InferRolesResult,
  type RoleDetectionDebug,
  type UnifiedHealingResult,
  getRoleSummary,
  inferRoles,
} from "../processors";
import { createDamageDonePanel } from "../DamageDone/DamageDone";
import { createDamageTakenPanel } from "../DamageTaken/DamageTaken";
import { createHealingDonePanel } from "../HealingDone/HealingDone";
import { usePanelAggregation } from "../usePanelAggregation";

const EMPTY_DEBUG: RoleDetectionDebug = {
  tankZThreshold: 0,
  healerZThreshold: 0,
  lowDpsPercentile: 0,
  healerHighZThreshold: 0,
  meanDamageTaken: 0,
  stdDevDamageTaken: 0,
  meanHealingDone: 0,
  stdDevHealingDone: 0,
  meanDamageDone: 0,
  stdDevDamageDone: 0,
  tankCutoff: 0,
  healerCutoff: 0,
  lowDpsCutoff: 0,
  healerHighCutoff: 0,
};

/** Reuses the Roles panel's aggregations and inference for other panel UIs. */
export function useInferredRoles(context: PanelContext) {
  const encounterIdsKey = context.selectedEncounterIds.slice().sort().join(",");
  const instanceId = context.instance.id;

  const stableContext = useMemo<PanelContext>(() => ({
    instance: context.instance,
    selectedEncounterIds: context.selectedEncounterIds,
    entitySelection: {
      enemyIds: new Set<string>(),
      playerIds: new Set<string>(),
    },
  // Roles must span the full selected raid, independent of entity selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [instanceId, encounterIdsKey]);

  // Role inference must remain stable while Replay moves. These source panels
  // always aggregate the full selected encounter rather than the Replay cursor.
  const damageTakenPanel = useMemo(
    () => ({ ...createDamageTakenPanel("players"), syncDataMode: "full" as const }),
    [],
  );
  const healingDonePanel = useMemo(
    () => ({ ...createHealingDonePanel("players"), syncDataMode: "full" as const }),
    [],
  );
  const damageDonePanel = useMemo(
    () => ({ ...createDamageDonePanel("players"), syncDataMode: "full" as const }),
    [],
  );

  const damageTakenAgg = usePanelAggregation<DamageTakenState>({
    panel: damageTakenPanel,
    context: stableContext,
  });
  const healingDoneAgg = usePanelAggregation<UnifiedHealingResult>({
    panel: healingDonePanel,
    context: stableContext,
  });
  const damageDoneAgg = usePanelAggregation<DamageDoneState>({
    panel: damageDonePanel,
    context: stableContext,
  });

  const damageTaken = useMemo(() => {
    const totals = new Map<string, number>();
    for (const encounterId of context.selectedEncounterIds) {
      const encounterData = damageTakenAgg.result.EncounterDamage.get(encounterId);
      if (!encounterData) continue;
      for (const [playerId, data] of encounterData) {
        let total = 0;
        for (const amount of data.source.values()) total += amount;
        totals.set(playerId, (totals.get(playerId) ?? 0) + total);
      }
    }
    return totals;
  }, [damageTakenAgg.result, context.selectedEncounterIds]);

  const healingDone = useMemo(() => {
    const totals = new Map<string, number>();
    for (const encounterId of context.selectedEncounterIds) {
      const encounterData = healingDoneAgg.result.EncounterHealingByHealer.get(encounterId);
      if (!encounterData) continue;
      for (const [playerId, data] of encounterData) {
        totals.set(playerId, (totals.get(playerId) ?? 0) + data.effectiveTotal);
      }
    }
    for (const [playerId, abilityMap] of healingDoneAgg.result.HealerByAbilityAbsorbed) {
      let total = 0;
      for (const amount of abilityMap.values()) total += amount;
      if (total > 0) totals.set(playerId, (totals.get(playerId) ?? 0) + total);
    }
    return totals;
  }, [healingDoneAgg.result, context.selectedEncounterIds]);

  const damageDone = useMemo(() => {
    const totals = new Map<string, number>();
    for (const encounterId of context.selectedEncounterIds) {
      const encounterData = damageDoneAgg.result.EncounterDamage.get(encounterId);
      if (!encounterData) continue;
      for (const [playerId, data] of encounterData) {
        let total = 0;
        for (const amount of data.target.values()) total += amount;
        totals.set(playerId, (totals.get(playerId) ?? 0) + total);
      }
    }
    return totals;
  }, [damageDoneAgg.result, context.selectedEncounterIds]);

  const inferred = useMemo<InferRolesResult>(() => {
    if (damageTaken.size === 0 && healingDone.size === 0 && damageDone.size === 0) {
      return { roles: new Map(), debug: EMPTY_DEBUG };
    }
    const players: Record<string, { name: string; class: string }> = {};
    for (const [guid, player] of Object.entries(context.instance.players ?? {})) {
      players[guid] = { name: player.name, class: player.class };
    }
    return inferRoles(damageTaken, healingDone, damageDone, players);
  }, [context.instance.players, damageDone, damageTaken, healingDone]);

  return {
    roles: inferred.roles,
    summary: getRoleSummary(inferred.roles),
    debug: inferred.debug,
    loading: damageTakenAgg.loading || healingDoneAgg.loading || damageDoneAgg.loading,
    processing: damageTakenAgg.processing || healingDoneAgg.processing || damageDoneAgg.processing,
    error: damageTakenAgg.error || healingDoneAgg.error || damageDoneAgg.error,
  };
}
