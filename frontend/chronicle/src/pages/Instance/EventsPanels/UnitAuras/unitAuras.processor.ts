import type {
  AuraProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  SlainProcessorEvent,
} from "../processorTypes";
import { AuraState, AuraTransition } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import {
  applyAuraEvent,
  createAuraProcessorState,
  getAuraCaster,
  hasAura,
  type AuraProcessorState,
  type AuraRef,
} from "../processors/auraProcessor";

export interface UnitAuraSegment {
  startMs: number;
  endMs: number;
  encounterId: string;
  sourceGuid: string | null;
  sourceName: string | null;
}

export interface UnitAuraEntry {
  auraKey: string;
  spellName: string;
  spellId: number | null;
  isBuff: boolean;
  applicationCount: number;
  totalUptimeMs: number;
  segments: UnitAuraSegment[];
}

export interface UnitAuraData {
  guid: string;
  name: string;
  auras: Map<string, UnitAuraEntry>;
}

interface ActiveUnitAura {
  targetGuid: string;
  targetName: string;
  auraKey: string;
  spellName: string;
  spellId: number | null;
  isBuff: boolean;
  startOffsetMs: number;
  encounterId: string;
  sourceGuid: string | null;
  sourceName: string | null;
}

export interface UnitAurasResult {
  byUnit: Map<string, UnitAuraData>;
  activeAuras: Map<string, ActiveUnitAura>;
  maxOffsetByEncounter: Map<string, number>;
  auraState: AuraProcessorState;
}

function auraKey(spellId: number | null, spellName: string): string {
  return spellId == null ? `name:${spellName.trim().toLowerCase()}` : `id:${spellId}`;
}

function activeKey(encounterId: string, targetGuid: string, key: string): string {
  return `${encounterId}\u0000${targetGuid}\u0000${key}`;
}

function auraRef(event: AuraProcessorEvent): AuraRef {
  return {
    spellId: event.spellId ?? undefined,
    spellName: event.spellName,
  };
}

function resolveUnitName(context: ProcessorContext, guid: string): string {
  return context.players[guid]?.name ?? context.units?.[guid]?.name ?? guid;
}

function resolveSourceName(
  context: ProcessorContext,
  targetGuid: string,
  sourceGuid: string | null,
): string | null {
  if (!sourceGuid) return null;
  if (sourceGuid === targetGuid) return "Self";
  return resolveUnitName(context, sourceGuid);
}

function getOrCreateUnit(
  byUnit: Map<string, UnitAuraData>,
  guid: string,
  name: string,
): UnitAuraData {
  let unit = byUnit.get(guid);
  if (!unit) {
    unit = { guid, name, auras: new Map() };
    byUnit.set(guid, unit);
  }
  return unit;
}

function getOrCreateAura(unit: UnitAuraData, active: ActiveUnitAura): UnitAuraEntry {
  let aura = unit.auras.get(active.auraKey);
  if (!aura) {
    aura = {
      auraKey: active.auraKey,
      spellName: active.spellName,
      spellId: active.spellId,
      isBuff: active.isBuff,
      applicationCount: 0,
      totalUptimeMs: 0,
      segments: [],
    };
    unit.auras.set(active.auraKey, aura);
  } else if (aura.spellId === null && active.spellId !== null) {
    aura.spellId = active.spellId;
  }
  return aura;
}

function appendSegment(
  byUnit: Map<string, UnitAuraData>,
  active: ActiveUnitAura,
  endOffsetMs: number,
): void {
  const uptimeMs = endOffsetMs - active.startOffsetMs;
  if (uptimeMs <= 0) return;

  const unit = getOrCreateUnit(byUnit, active.targetGuid, active.targetName);
  const aura = getOrCreateAura(unit, active);
  aura.segments.push({
    startMs: active.startOffsetMs,
    endMs: endOffsetMs,
    encounterId: active.encounterId,
    sourceGuid: active.sourceGuid,
    sourceName: active.sourceName,
  });
  aura.applicationCount++;
  aura.totalUptimeMs += uptimeMs;
}

function startAura(
  state: UnitAurasResult,
  event: AuraProcessorEvent,
  encounterId: string,
  context: ProcessorContext,
  sourceGuid: string | null,
): void {
  const key = auraKey(event.spellId, event.spellName);
  state.activeAuras.set(activeKey(encounterId, event.target, key), {
    targetGuid: event.target,
    targetName: resolveUnitName(context, event.target),
    auraKey: key,
    spellName: event.spellName,
    spellId: event.spellId,
    isBuff: event.isBuff,
    startOffsetMs: event.offsetMilli,
    encounterId,
    sourceGuid,
    sourceName: resolveSourceName(context, event.target, sourceGuid),
  });
}

function finishAurasOnTarget(
  state: UnitAurasResult,
  encounterId: string,
  targetGuid: string,
  endOffsetMs: number,
): void {
  for (const [key, active] of state.activeAuras) {
    if (active.encounterId !== encounterId || active.targetGuid !== targetGuid) continue;
    appendSegment(state.byUnit, active, endOffsetMs);
    state.activeAuras.delete(key);
  }
}

export function materializeActiveUnitAuras(
  state: UnitAurasResult,
  encounterEndOffsets: ReadonlyMap<string, number> = state.maxOffsetByEncounter,
): Map<string, UnitAuraData> {
  const byUnit = new Map(state.byUnit);
  const clonedUnits = new Set<string>();
  const clonedAuras = new Set<string>();

  for (const active of state.activeAuras.values()) {
    const endOffsetMs = encounterEndOffsets.get(active.encounterId)
      ?? state.maxOffsetByEncounter.get(active.encounterId)
      ?? active.startOffsetMs;
    if (endOffsetMs <= active.startOffsetMs) continue;

    if (!clonedUnits.has(active.targetGuid)) {
      const existing = byUnit.get(active.targetGuid);
      byUnit.set(active.targetGuid, existing
        ? { ...existing, auras: new Map(existing.auras) }
        : { guid: active.targetGuid, name: active.targetName, auras: new Map() });
      clonedUnits.add(active.targetGuid);
    }

    const unit = byUnit.get(active.targetGuid)!;
    const cloneKey = `${active.targetGuid}\u0000${active.auraKey}`;
    if (!clonedAuras.has(cloneKey)) {
      const existing = unit.auras.get(active.auraKey);
      if (existing) {
        unit.auras.set(active.auraKey, { ...existing, segments: [...existing.segments] });
      }
      clonedAuras.add(cloneKey);
    }

    appendSegment(byUnit, active, endOffsetMs);
  }

  return byUnit;
}

type UnitAurasEvent = AuraProcessorEvent | SlainProcessorEvent;

export const unitAurasProcessor: PanelProcessor<UnitAurasResult, UnitAurasEvent> = {
  id: "unit_auras",
  streams: ["aura", "slain"] as StreamType[],

  createState: (): UnitAurasResult => ({
    byUnit: new Map(),
    activeAuras: new Map(),
    maxOffsetByEncounter: new Map(),
    auraState: createAuraProcessorState(),
  }),

  processEvent: (state, event, encounterId, _firstTimestamp, _streamType, context): void => {
    if (!context.selectedEncounterIds.has(encounterId)) return;

    const currentMax = state.maxOffsetByEncounter.get(encounterId) ?? 0;
    if (event.offsetMilli > currentMax) {
      state.maxOffsetByEncounter.set(encounterId, event.offsetMilli);
    }

    if (event.type === "slain") {
      applyAuraEvent(state.auraState, encounterId, event);
      finishAurasOnTarget(state, encounterId, event.target, event.offsetMilli);
      return;
    }

    const ref = auraRef(event);
    const key = auraKey(event.spellId, event.spellName);
    const keyForActive = activeKey(encounterId, event.target, key);
    const wasActive = hasAura(state.auraState, encounterId, event.target, ref);

    applyAuraEvent(state.auraState, encounterId, event);

    const isActive = hasAura(state.auraState, encounterId, event.target, ref);
    const sourceGuid = event.caster ?? getAuraCaster(state.auraState, encounterId, event.target, ref);
    const refreshesApplication = wasActive && isActive && (
      event.state === AuraState.Added
      || event.transition === AuraTransition.Applied
      || event.transition === AuraTransition.Refreshed
    );

    if (refreshesApplication) {
      const active = state.activeAuras.get(keyForActive);
      if (active) appendSegment(state.byUnit, active, event.offsetMilli);
      startAura(state, event, encounterId, context, sourceGuid);
      return;
    }

    if (!wasActive && isActive) {
      startAura(state, event, encounterId, context, sourceGuid);
      return;
    }

    if (wasActive && !isActive) {
      const active = state.activeAuras.get(keyForActive);
      if (active) {
        appendSegment(state.byUnit, active, event.offsetMilli);
        state.activeAuras.delete(keyForActive);
      }
    }
  },
};
