import type {
  DamageProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  SlainProcessorEvent,
} from "../processorTypes";
import { absorbedDamageFromTailers } from "../processors/damageTailers";
import { createGuidCache, getCachedGuid, type GuidCache } from "../processors/guidCache";
import { resolveEntity } from "../processors/resolveEntity";

const ASSEMBLY_ENTRIES = new Set([32857, 32867, 32927, 33692, 33693, 33694]);

export type AssemblyPlayerDamage = Map<string, number>;

export interface AssemblyRankedDamageResult {
  committed: Map<string, AssemblyPlayerDamage>;
  pending: Map<string, Map<string, AssemblyPlayerDamage>>;
  guidCache: GuidCache;
}

function isAssemblyTarget(cache: GuidCache, id: string): boolean {
  const { entry, ok } = getCachedGuid(cache, id).getEntry();
  return ok && ASSEMBLY_ENTRIES.has(entry);
}

function addDamage(store: AssemblyPlayerDamage, playerID: string, amount: number): void {
  store.set(playerID, (store.get(playerID) ?? 0) + amount);
}

function mergeDamage(destination: AssemblyPlayerDamage, source: AssemblyPlayerDamage | undefined): void {
  if (!source) return;
  for (const [playerID, amount] of source) {
    addDamage(destination, playerID, amount);
  }
}

export function rankedDamageForEncounter(
  result: AssemblyRankedDamageResult,
  encounterID: string,
): AssemblyPlayerDamage {
  const totals = new Map(result.committed.get(encounterID) ?? []);
  for (const targetDamage of result.pending.get(encounterID)?.values() ?? []) {
    mergeDamage(totals, targetDamage);
  }
  return totals;
}

export const assemblyRankedDamageProcessor: PanelProcessor<
  AssemblyRankedDamageResult,
  DamageProcessorEvent | SlainProcessorEvent
> = {
  id: "assembly_ranked_damage",
  streams: ["damage", "slain"],
  createState: () => ({
    committed: new Map(),
    pending: new Map(),
    guidCache: createGuidCache(),
  }),
  processEvent: (
    state: AssemblyRankedDamageResult,
    event: DamageProcessorEvent | SlainProcessorEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType: string,
    context: ProcessorContext,
  ): void => {
    if (!context.selectedEncounterIds.has(encounterID)) return;

    if (event.type === "slain") {
      if (!isAssemblyTarget(state.guidCache, event.target)) return;

      const phase = state.pending.get(encounterID);
      const committed = state.committed.get(encounterID) ?? new Map<string, number>();
      mergeDamage(committed, phase?.get(event.target));
      state.committed.set(encounterID, committed);
      state.pending.delete(encounterID);
      return;
    }

    if (!event.caster || !isAssemblyTarget(state.guidCache, event.target)) return;

    const entity = resolveEntity(event.caster, context, "merged", "owner");
    if (!context.players[entity.id]) return;

    const effectiveAmount = event.amount + absorbedDamageFromTailers(event);
    if (effectiveAmount <= 0) return;

    const phase = state.pending.get(encounterID) ?? new Map<string, AssemblyPlayerDamage>();
    const targetDamage = phase.get(event.target) ?? new Map<string, number>();
    addDamage(targetDamage, entity.id, effectiveAmount);
    phase.set(event.target, targetDamage);
    state.pending.set(encounterID, phase);
  },
};
