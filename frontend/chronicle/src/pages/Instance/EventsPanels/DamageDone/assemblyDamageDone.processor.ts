import type {
  DamageProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  SlainProcessorEvent,
} from "../processorTypes";
import type {
  DamageAbilityBreakout,
  HitTypeStats,
  SpellIdAbilityBreakout,
} from "../processors/abilityBreakout";
import { getCachedGuid } from "../processors/guidCache";
import {
  createDamageDoneResult,
  damageDoneProcessor,
  type DamageDoneData,
  type DamageDoneResult,
  type EncounterUnitTargetValue,
  type UnitDamage,
} from "./damageDone.processor";

const ASSEMBLY_ENTRIES = new Set([32857, 32867, 32927, 33692, 33693, 33694]);

interface AssemblyDamageDoneContext {
  assemblyEncounterIds?: string[];
  assemblyStaticMode?: boolean;
}

export interface AssemblyDamageDoneResult extends DamageDoneResult {
  _assemblyPhaseDamage: Map<string, Map<string, DamageDoneResult>>;
}

function assemblyContext(context: ProcessorContext): AssemblyDamageDoneContext {
  return (context.panelContext as AssemblyDamageDoneContext | null) ?? {};
}

function isAssemblyEncounter(context: ProcessorContext, encounterID: string): boolean {
  return assemblyContext(context).assemblyEncounterIds?.includes(encounterID) === true;
}

function isAssemblyTarget(state: DamageDoneResult, context: ProcessorContext, id: string): boolean {
  const unitEntry = context.units?.[id]?.entry;
  if (unitEntry != null) return ASSEMBLY_ENTRIES.has(unitEntry);
  const { entry, ok } = getCachedGuid(state.GuidCache, id).getEntry();
  return ok && ASSEMBLY_ENTRIES.has(entry);
}

function mergeHitStats(destination: HitTypeStats | undefined, source: HitTypeStats | undefined): HitTypeStats | undefined {
  if (!source) return destination;
  if (!destination) return { ...source };
  destination.count += source.count;
  destination.total += source.total;
  destination.min = Math.min(destination.min, source.min);
  destination.max = Math.max(destination.max, source.max);
  return destination;
}

function mergeBreakout(destination: DamageAbilityBreakout, source: DamageAbilityBreakout): void {
  destination.Total += source.Total;
  destination.Absorbed = (destination.Absorbed ?? 0) + (source.Absorbed ?? 0);
  destination.Count += source.Count;
  destination.Crits += source.Crits;
  destination.Hits += source.Hits;
  destination.Misses += source.Misses;

  for (const key of [
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
  ] as const) {
    destination[key] = (destination[key] ?? 0) + (source[key] ?? 0);
  }

  destination.HitStats = mergeHitStats(destination.HitStats, source.HitStats);
  destination.CritStats = mergeHitStats(destination.CritStats, source.CritStats);
  destination.GlancingStats = mergeHitStats(destination.GlancingStats, source.GlancingStats);
  destination.CrushingStats = mergeHitStats(destination.CrushingStats, source.CrushingStats);
  destination.AbsorbStats = mergeHitStats(destination.AbsorbStats, source.AbsorbStats);
  destination.spellId ??= source.spellId;
}

function mergeBreakoutMap<TKey extends string | number, TBreakout extends DamageAbilityBreakout>(
  destination: Map<string, Map<TKey, TBreakout>>,
  source: Map<string, Map<TKey, TBreakout>>,
): void {
  for (const [unitID, sourceEntries] of source) {
    const destinationEntries = destination.get(unitID) ?? new Map<TKey, TBreakout>();
    for (const [key, sourceEntry] of sourceEntries) {
      const destinationEntry = destinationEntries.get(key);
      if (destinationEntry) {
        mergeBreakout(destinationEntry, sourceEntry);
      } else {
        destinationEntries.set(key, structuredClone(sourceEntry));
      }
    }
    destination.set(unitID, destinationEntries);
  }
}

function mergeUnitDamage(destination: UnitDamage, source: UnitDamage): void {
  for (const [unitID, sourceData] of source) {
    const destinationData = destination.get(unitID) ?? {
      ...sourceData,
      target: new Map<string, number>(),
    } satisfies DamageDoneData;
    for (const [targetID, amount] of sourceData.target) {
      destinationData.target.set(targetID, (destinationData.target.get(targetID) ?? 0) + amount);
    }
    destination.set(unitID, destinationData);
  }
}

function mergeEncounterDamage(
  destination: UnitDamage,
  source: DamageDoneResult,
  encounterID: string,
): void {
  const sourceDamage = source.EncounterDamage.get(encounterID);
  if (sourceDamage) mergeUnitDamage(destination, sourceDamage);
}

function mergeEncounterTargetValues(
  destination: Map<string, EncounterUnitTargetValue>,
  source: Map<string, EncounterUnitTargetValue>,
): void {
  for (const [encounterID, sourceUnits] of source) {
    const destinationUnits = destination.get(encounterID) ?? new Map<string, Map<string, number>>();
    for (const [unitID, sourceTargets] of sourceUnits) {
      const destinationTargets = destinationUnits.get(unitID) ?? new Map<string, number>();
      for (const [targetID, amount] of sourceTargets) {
        destinationTargets.set(targetID, (destinationTargets.get(targetID) ?? 0) + amount);
      }
      destinationUnits.set(unitID, destinationTargets);
    }
    destination.set(encounterID, destinationUnits);
  }
}

function mergeOwnerTargetValues(
  destination: Map<string, Map<string, number>>,
  source: Map<string, Map<string, number>>,
): void {
  for (const [unitID, sourceTargets] of source) {
    const destinationTargets = destination.get(unitID) ?? new Map<string, number>();
    for (const [targetID, amount] of sourceTargets) {
      destinationTargets.set(targetID, (destinationTargets.get(targetID) ?? 0) + amount);
    }
    destination.set(unitID, destinationTargets);
  }
}

function mergeDamageDoneResult(destination: DamageDoneResult, source: DamageDoneResult): void {
  for (const [encounterID, sourceDamage] of source.EncounterDamage) {
    const destinationDamage = destination.EncounterDamage.get(encounterID) ?? new Map<string, DamageDoneData>();
    mergeUnitDamage(destinationDamage, sourceDamage);
    destination.EncounterDamage.set(encounterID, destinationDamage);
  }
  mergeBreakoutMap(destination.ByAbility, source.ByAbility);
  mergeBreakoutMap<number, SpellIdAbilityBreakout>(destination.ByAbilityBySpellId, source.ByAbilityBySpellId);
  mergeOwnerTargetValues(destination.ByTarget, source.ByTarget);
  mergeEncounterTargetValues(destination.EncounterVulnerabilityBonus, source.EncounterVulnerabilityBonus);
  mergeEncounterTargetValues(destination.EncounterVulnerabilityBase, source.EncounterVulnerabilityBase);
  mergeBreakoutMap(destination.VulnerabilityByAbilityBonus, source.VulnerabilityByAbilityBonus);
  mergeBreakoutMap(destination.VulnerabilityByAbilityBase, source.VulnerabilityByAbilityBase);
  mergeBreakoutMap<number, SpellIdAbilityBreakout>(
    destination.VulnerabilityByAbilityBySpellIdBonus,
    source.VulnerabilityByAbilityBySpellIdBonus,
  );
  mergeBreakoutMap<number, SpellIdAbilityBreakout>(
    destination.VulnerabilityByAbilityBySpellIdBase,
    source.VulnerabilityByAbilityBySpellIdBase,
  );
  mergeOwnerTargetValues(destination.VulnerabilityByTargetBonus, source.VulnerabilityByTargetBonus);
  mergeOwnerTargetValues(destination.VulnerabilityByTargetBase, source.VulnerabilityByTargetBase);
  destination._damageEventsWithSunderArmor += source._damageEventsWithSunderArmor;
}

function mergeExcludedBreakouts(
  state: AssemblyDamageDoneResult,
  source: DamageDoneResult,
): void {
  state.ExcludedByAbility ??= new Map();
  state.ExcludedByAbilityBySpellId ??= new Map();
  state.ExcludedByTarget ??= new Map();
  mergeBreakoutMap(state.ExcludedByAbility, source.ByAbility);
  mergeBreakoutMap<number, SpellIdAbilityBreakout>(
    state.ExcludedByAbilityBySpellId,
    source.ByAbilityBySpellId,
  );
  mergeOwnerTargetValues(state.ExcludedByTarget, source.ByTarget);
}

function phaseDamage(
  state: AssemblyDamageDoneResult,
  encounterID: string,
): Map<string, DamageDoneResult> {
  const existing = state._assemblyPhaseDamage.get(encounterID);
  if (existing) return existing;
  const created = new Map<string, DamageDoneResult>();
  state._assemblyPhaseDamage.set(encounterID, created);
  return created;
}

function commitSlainTarget(
  state: AssemblyDamageDoneResult,
  encounterID: string,
  targetID: string,
): void {
  const phase = state._assemblyPhaseDamage.get(encounterID);
  if (!phase) return;

  const included = phase.get(targetID);
  if (included) mergeDamageDoneResult(state, included);

  const excludedByEncounter = state.EncounterExcludedDamage ?? new Map<string, UnitDamage>();
  const encounterExcluded = excludedByEncounter.get(encounterID) ?? new Map<string, DamageDoneData>();
  for (const [phaseTargetID, result] of phase) {
    if (phaseTargetID === targetID) continue;
    mergeEncounterDamage(encounterExcluded, result, encounterID);
    mergeExcludedBreakouts(state, result);
  }
  if (encounterExcluded.size > 0) {
    excludedByEncounter.set(encounterID, encounterExcluded);
    state.EncounterExcludedDamage = excludedByEncounter;
  }
  state._assemblyPhaseDamage.delete(encounterID);
}

export const assemblyDamageDoneProcessor: PanelProcessor<
  AssemblyDamageDoneResult,
  DamageProcessorEvent | SlainProcessorEvent
> = {
  id: "damage_done_assembly",
  streams: ["damage", "slain"],
  createState: () => ({
    ...createDamageDoneResult(),
    EncounterExcludedDamage: new Map(),
    ExcludedByAbility: new Map(),
    ExcludedByAbilityBySpellId: new Map(),
    ExcludedByTarget: new Map(),
    _assemblyPhaseDamage: new Map(),
  }),
  processEvent: (state, event, encounterID, firstTimestamp, streamType, context) => {
    const staticMode = assemblyContext(context).assemblyStaticMode === true;
    if (!staticMode || !isAssemblyEncounter(context, encounterID)) {
      if (event.type === "damage") {
        damageDoneProcessor.processEvent(state, event, encounterID, firstTimestamp, streamType, context);
      }
      return;
    }

    if (event.type === "slain") {
      if (isAssemblyTarget(state, context, event.target)) commitSlainTarget(state, encounterID, event.target);
      return;
    }

    if (!isAssemblyTarget(state, context, event.target)) {
      damageDoneProcessor.processEvent(state, event, encounterID, firstTimestamp, streamType, context);
      return;
    }

    const phase = phaseDamage(state, encounterID);
    const targetResult = phase.get(event.target) ?? createDamageDoneResult();
    const rankedEvent = event.overkill > 0 ? { ...event, overkill: 0 } : event;
    damageDoneProcessor.processEvent(targetResult, rankedEvent, encounterID, firstTimestamp, streamType, context);
    phase.set(event.target, targetResult);
  },
  finalizeEncounter: (state, encounterID, context) => {
    if (assemblyContext(context).assemblyStaticMode !== true || !isAssemblyEncounter(context, encounterID)) return;
    const phase = state._assemblyPhaseDamage.get(encounterID);
    if (!phase) return;
    for (const result of phase.values()) mergeDamageDoneResult(state, result);
    state._assemblyPhaseDamage.delete(encounterID);
  },
};
