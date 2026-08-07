import { useMemo } from "react";
import type { PanelContext } from "../types";
import {
  type DamageDoneState,
  type InferRolesResult,
  type RoleDetectionDebug,
  type TankAttemptCounts,
  type TankInferenceResult,
  type UnifiedHealingResult,
  getRoleSummary,
  inferRoles,
  inferTanks,
  tankAttemptsProcessor,
} from "../processors";
import { createDamageDonePanel } from "../DamageDone/DamageDone";
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
  const tankAttemptsPanel = useMemo(
    () => ({
      ...tankAttemptsProcessor,
      syncDataMode: "full" as const,
      // Satisfy PanelDefinition interface — this panel is internal, never rendered.
      label: "Tank Attempts",
      icon: null,
      render: () => null,
    }),
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

  const tankAttemptsAgg = usePanelAggregation<TankAttemptCounts>({
    panel: tankAttemptsPanel,
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

  // Tank inference from Auto Attack attempt counts.
  const tankResult = useMemo<TankInferenceResult>(() => {
    return inferTanks(tankAttemptsAgg.result, context.selectedEncounterIds);
  }, [tankAttemptsAgg.result, context.selectedEncounterIds]);

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

  // Resolve source names from the units context for the debug UI.
  const tankResultWithNames = useMemo<TankInferenceResult>(() => {
    const units = context.instance.units;
    if (!units) return tankResult;
    for (const ev of tankResult.evidence.values()) {
      if (ev.strongestSource && units[ev.strongestSource.sourceGuid]) {
        ev.strongestSource.sourceName = units[ev.strongestSource.sourceGuid].name;
      }
    }
    return tankResult;
  }, [tankResult, context.instance.units]);

  const inferred = useMemo<InferRolesResult>(() => {
    if (tankResultWithNames.evidence.size === 0 && healingDone.size === 0 && damageDone.size === 0) {
      return { roles: new Map(), debug: EMPTY_DEBUG };
    }
    const players: Record<string, { name: string; class: string }> = {};
    for (const [guid, player] of Object.entries(context.instance.players ?? {})) {
      players[guid] = { name: player.name, class: player.class };
    }
    return inferRoles(tankResultWithNames, healingDone, damageDone, players);
  }, [context.instance.players, damageDone, tankResultWithNames, healingDone]);

  return {
    roles: inferred.roles,
    summary: getRoleSummary(inferred.roles),
    debug: inferred.debug,
    tankEvidence: tankResultWithNames,
    loading: tankAttemptsAgg.loading || healingDoneAgg.loading || damageDoneAgg.loading,
    processing: tankAttemptsAgg.processing || healingDoneAgg.processing || damageDoneAgg.processing,
    error: tankAttemptsAgg.error || healingDoneAgg.error || damageDoneAgg.error,
  };
}
