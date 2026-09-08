import type { AuraProcessorEvent, ProcessorEvent, SlainProcessorEvent } from "../processorTypes";
import { AuraState } from "../processorTypes";

/**
 * Aura reference for lookup operations.
 * Spell ID is preferred when available, with spell name fallback.
 */
export interface AuraRef {
  spellId?: number;
  spellName?: string;
}

export interface ActiveAura {
  spellId: number | null;
  normalizedSpellName: string;
  caster: string | null;
  isBuff: boolean;
  stacks: number;
}

/**
 * Central aura tracking state.
 * encounterID -> targetGUID -> auraKey -> aura data
 */
export interface AuraProcessorState {
  activeByEncounter: Map<string, Map<string, Map<string, ActiveAura>>>;
}

function normalizeSpellName(spellName: string | undefined | null): string {
  return (spellName ?? "").trim().toLowerCase();
}

function spellIdKey(spellId: number): string {
  return `id:${spellId}`;
}

function spellNameKey(normalizedSpellName: string): string {
  return `name:${normalizedSpellName}`;
}

function auraKeyFromEvent(event: AuraProcessorEvent): string | null {
  if (event.spellId != null) {
    return spellIdKey(event.spellId);
  }

  const normalizedSpellName = normalizeSpellName(event.spellName);
  if (!normalizedSpellName) {
    return null;
  }

  return spellNameKey(normalizedSpellName);
}

function getOrCreateEncounterAuras(
  state: AuraProcessorState,
  encounterID: string,
): Map<string, Map<string, ActiveAura>> {
  let encounterAuras = state.activeByEncounter.get(encounterID);
  if (!encounterAuras) {
    encounterAuras = new Map<string, Map<string, ActiveAura>>();
    state.activeByEncounter.set(encounterID, encounterAuras);
  }
  return encounterAuras;
}

function getOrCreateTargetAuras(
  state: AuraProcessorState,
  encounterID: string,
  targetGuid: string,
): Map<string, ActiveAura> {
  const encounterAuras = getOrCreateEncounterAuras(state, encounterID);

  let targetAuras = encounterAuras.get(targetGuid);
  if (!targetAuras) {
    targetAuras = new Map<string, ActiveAura>();
    encounterAuras.set(targetGuid, targetAuras);
  }

  return targetAuras;
}

function getTargetAuras(
  state: AuraProcessorState,
  encounterID: string,
  targetGuid: string,
): Map<string, ActiveAura> | null {
  const encounterAuras = state.activeByEncounter.get(encounterID);
  if (!encounterAuras) return null;
  return encounterAuras.get(targetGuid) ?? null;
}

function cleanupEmptyMaps(
  state: AuraProcessorState,
  encounterID: string,
  targetGuid: string,
): void {
  const encounterAuras = state.activeByEncounter.get(encounterID);
  if (!encounterAuras) return;

  const targetAuras = encounterAuras.get(targetGuid);
  if (targetAuras && targetAuras.size === 0) {
    encounterAuras.delete(targetGuid);
  }

  if (encounterAuras.size === 0) {
    state.activeByEncounter.delete(encounterID);
  }
}

function removeMatchingAuras(
  targetAuras: Map<string, ActiveAura>,
  auraRef: AuraRef,
): void {
  const spellId = "spellId" in auraRef ? auraRef.spellId : undefined;
  if (spellId != null) {
    targetAuras.delete(spellIdKey(spellId));
  }

  const spellName = "spellName" in auraRef ? auraRef.spellName : undefined;
  const normalizedSpellName = normalizeSpellName(spellName);
  if (normalizedSpellName) {
    targetAuras.delete(spellNameKey(normalizedSpellName));

    for (const [key, aura] of targetAuras) {
      if (aura.normalizedSpellName === normalizedSpellName) {
        targetAuras.delete(key);
      }
    }
  }
}

function applyAuraStateEvent(
  state: AuraProcessorState,
  encounterID: string,
  event: AuraProcessorEvent,
): void {
  const key = auraKeyFromEvent(event);
  if (!key) return;

  const targetAuras = getOrCreateTargetAuras(state, encounterID, event.target);
  const normalizedSpellName = normalizeSpellName(event.spellName);

  if (event.amount <= 0) {
    removeMatchingAuras(targetAuras, { spellId: event.spellId ?? undefined, spellName: event.spellName });
    cleanupEmptyMaps(state, encounterID, event.target);
    return;
  }

  if (
    event.state !== AuraState.Added &&
    event.state !== AuraState.Removed &&
    event.state !== AuraState.Modified
  ) {
    return;
  }

  const stacks = event.amount;

  const previous = targetAuras.get(key);
  targetAuras.set(key, {
    spellId: event.spellId,
    normalizedSpellName,
    caster: event.caster ?? previous?.caster ?? null,
    isBuff: event.isBuff,
    stacks,
  });

  // If we now have a spell ID entry, remove any fallback name-only entry for the same spell.
  if (event.spellId != null && normalizedSpellName) {
    targetAuras.delete(spellNameKey(normalizedSpellName));
  }
}

function applySlainCleanup(
  state: AuraProcessorState,
  encounterID: string,
  targetGuid: string,
): void {
  const encounterAuras = state.activeByEncounter.get(encounterID);
  if (!encounterAuras) return;

  encounterAuras.delete(targetGuid);
  if (encounterAuras.size === 0) {
    state.activeByEncounter.delete(encounterID);
  }
}

export function createAuraProcessorState(): AuraProcessorState {
  return {
    activeByEncounter: new Map(),
  };
}

/**
 * Apply aura-lifecycle related events to central aura state.
 * Handles "aura" and "slain" events; all other stream events are ignored.
 */
export function applyAuraEvent(
  state: AuraProcessorState,
  encounterID: string,
  event: ProcessorEvent,
): void {
  if (event.type === "aura") {
    applyAuraStateEvent(state, encounterID, event);
    return;
  }

  if (event.type === "slain") {
    applySlainCleanup(state, encounterID, event.target);
  }
}

/**
 * Backward-compatible wrapper for explicit slain handling callsites.
 */
export function applySlainEvent(
  state: AuraProcessorState,
  encounterID: string,
  event: SlainProcessorEvent,
): void {
  applyAuraEvent(state, encounterID, event);
}

/**
 * Return current stacks for a tracked aura on a target.
 */
export function getAuraStacks(
  state: AuraProcessorState,
  encounterID: string,
  targetGuid: string,
  auraRef: AuraRef,
): number {
  const targetAuras = getTargetAuras(state, encounterID, targetGuid);
  if (!targetAuras) return 0;

  let maxStacks = 0;

  const spellId = "spellId" in auraRef ? auraRef.spellId : undefined;
  if (spellId != null) {
    maxStacks = Math.max(maxStacks, targetAuras.get(spellIdKey(spellId))?.stacks ?? 0);
  }

  const spellName = "spellName" in auraRef ? auraRef.spellName : undefined;
  const normalizedSpellName = normalizeSpellName(spellName);
  if (normalizedSpellName) {
    maxStacks = Math.max(maxStacks, targetAuras.get(spellNameKey(normalizedSpellName))?.stacks ?? 0);

    for (const aura of targetAuras.values()) {
      if (aura.normalizedSpellName === normalizedSpellName) {
        maxStacks = Math.max(maxStacks, aura.stacks);
      }
    }
  }

  return maxStacks;
}

/**
 * Return the known caster for a tracked aura, or null when unavailable.
 */
export function getAuraCaster(
  state: AuraProcessorState,
  encounterID: string,
  targetGuid: string,
  auraRef: AuraRef,
): string | null {
  const targetAuras = getTargetAuras(state, encounterID, targetGuid);
  if (!targetAuras) return null;

  const spellId = "spellId" in auraRef ? auraRef.spellId : undefined;
  if (spellId != null) {
    const aura = targetAuras.get(spellIdKey(spellId));
    if (aura) return aura.caster;
  }

  const normalizedSpellName = normalizeSpellName("spellName" in auraRef ? auraRef.spellName : undefined);
  if (!normalizedSpellName) return null;

  const namedAura = targetAuras.get(spellNameKey(normalizedSpellName));
  if (namedAura) return namedAura.caster;

  for (const aura of targetAuras.values()) {
    if (aura.normalizedSpellName === normalizedSpellName) {
      return aura.caster;
    }
  }

  return null;
}

/**
 * Check whether a target currently has an aura.
 */
export function hasAura(
  state: AuraProcessorState,
  encounterID: string,
  targetGuid: string,
  auraRef: AuraRef,
): boolean {
  return getAuraStacks(state, encounterID, targetGuid, auraRef) > 0;
}
