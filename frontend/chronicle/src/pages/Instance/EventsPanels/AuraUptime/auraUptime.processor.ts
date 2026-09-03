/**
 * Aura Uptime processor - Tracks buff/debuff uptime on targets.
 * 
 * This processor collects all unique aura names and tracks uptime per target
 * for each aura. The UI allows selecting an aura to display detailed uptime.
 * 
 * Aura events may also include a caster when the combat log format can attribute one.
 * Uptime remains grouped by target, while shared aura state retains known caster ownership.
 */

import type { PanelProcessor, ProcessorContext, AuraProcessorEvent, SlainProcessorEvent } from "../processorTypes";
import { AuraState } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import { applyAuraEvent, createAuraProcessorState, hasAura, type AuraRef, type AuraProcessorState } from "../processors/auraProcessor";

/** A segment of time when an aura was active */
export interface UptimeSegment {
  startMs: number;
  endMs: number;
  encounterId: string;
}

/** Uptime data for a single target */
export interface TargetUptimeData {
  guid: string;
  name: string;
  applicationCount: number;
  totalUptimeMs: number;
  /** Segments for timeline visualization */
  segments: UptimeSegment[];
}

/** Data for a single aura across all targets */
export interface AuraData {
  spellId: number | null;
  perTarget: Map<string, TargetUptimeData>;
}

/** Active aura tracking (before finalization) */
interface ActiveAura {
  targetGuid: string;
  targetName: string;
  spellName: string;
  spellId: number | null;
  startOffsetMs: number;
  encounterId: string;
}

/** Result type for the Aura Uptime processor */
export interface AuraUptimeResult {
  /** All unique aura names seen (for dropdown) - stored as array for serialization */
  auraNames: string[];
  /** Set for fast lookup during processing (not serialized) */
  auraNameSet: Set<string>;
  /** Per-aura data: auraName -> { perTarget: Map<guid, UptimeData> } */
  byAura: Map<string, AuraData>;
  /** Active auras for finalization (key: "target:spellName") */
  activeAuras: Map<string, ActiveAura>;
  /** Max offset per encounter (for finalizing active auras at encounter end) */
  maxOffsetByEncounter: Map<string, number>;
  /** Last encounter ID processed (for detecting transitions) */
  lastEncounterId: string | null;
  /** Central aura tracker used for lifecycle transitions */
  auraState: AuraProcessorState;
}

/** Create a composite key for active auras */
function activeKey(targetGuid: string, spellName: string): string {
  return `${targetGuid}:${spellName}`;
}

function eventAuraRef(event: AuraProcessorEvent): AuraRef {
  return {
    spellId: event.spellId ?? undefined,
    spellName: event.spellName,
  };
}

/** Initialize target uptime data */
function initTargetData(guid: string, name: string): TargetUptimeData {
  return {
    guid,
    name,
    applicationCount: 0,
    totalUptimeMs: 0,
    segments: [],
  };
}

/** Get or create aura data for a spell name */
function getOrCreateAuraData(state: AuraUptimeResult, spellName: string, spellId: number | null = null): AuraData {
  let auraData = state.byAura.get(spellName);
  if (!auraData) {
    auraData = { spellId, perTarget: new Map() };
    state.byAura.set(spellName, auraData);
    // Track in both array and set
    if (!state.auraNameSet.has(spellName)) {
      state.auraNameSet.add(spellName);
      state.auraNames.push(spellName);
    }
  } else if (auraData.spellId === null && spellId !== null) {
    // Update spell ID if we didn't have one before
    auraData.spellId = spellId;
  }
  return auraData;
}

/** Finalize an active aura and record the uptime segment */
function finalizeActiveAura(
  state: AuraUptimeResult,
  active: ActiveAura,
  endOffsetMs: number,
): void {
  const uptimeMs = endOffsetMs - active.startOffsetMs;
  if (uptimeMs <= 0) return;
  
  const auraData = getOrCreateAuraData(state, active.spellName, active.spellId);
  
  let targetData = auraData.perTarget.get(active.targetGuid);
  if (!targetData) {
    targetData = initTargetData(active.targetGuid, active.targetName);
    auraData.perTarget.set(active.targetGuid, targetData);
  }
  
  targetData.segments.push({
    startMs: active.startOffsetMs,
    endMs: endOffsetMs,
    encounterId: active.encounterId,
  });
  targetData.totalUptimeMs += uptimeMs;
  targetData.applicationCount++;
}

/** Finalize all active auras on a specific target (when they die) */
function finalizeAurasOnTarget(state: AuraUptimeResult, targetGuid: string, endOffsetMs: number): void {
  const keysToRemove: string[] = [];
  
  for (const [key, active] of state.activeAuras) {
    if (active.targetGuid !== targetGuid) continue;
    finalizeActiveAura(state, active, endOffsetMs);
    keysToRemove.push(key);
  }
  
  for (const key of keysToRemove) {
    state.activeAuras.delete(key);
  }
}

/** Finalize all active auras (at encounter transition) */
function finalizeAllActiveAuras(state: AuraUptimeResult): void {
  for (const [, active] of state.activeAuras) {
    const endOffsetMs = state.maxOffsetByEncounter.get(active.encounterId) ?? active.startOffsetMs;
    finalizeActiveAura(state, active, endOffsetMs);
  }
  state.activeAuras.clear();
}

function startActiveAura(
  state: AuraUptimeResult,
  event: AuraProcessorEvent,
  encounterID: string,
  context: ProcessorContext,
): void {
  const key = activeKey(event.target, event.spellName);
  const targetName = context.units?.[event.target]?.name ?? context.players[event.target]?.name ?? event.target;

  state.activeAuras.set(key, {
    targetGuid: event.target,
    targetName,
    spellName: event.spellName,
    spellId: event.spellId,
    startOffsetMs: event.offsetMilli,
    encounterId: encounterID,
  });

  if (!state.auraNameSet.has(event.spellName)) {
    state.auraNameSet.add(event.spellName);
    state.auraNames.push(event.spellName);
  }
}

type AuraUptimeEvent = AuraProcessorEvent | SlainProcessorEvent;

/**
 * Aura Uptime processor implementation.
 */
export const auraUptimeProcessor: PanelProcessor<AuraUptimeResult, AuraUptimeEvent> = {
  id: "aura_uptime",
  streams: ["aura", "slain"] as StreamType[],
  
  createState: (): AuraUptimeResult => ({
    auraNames: [],
    auraNameSet: new Set(),
    byAura: new Map(),
    activeAuras: new Map(),
    maxOffsetByEncounter: new Map(),
    lastEncounterId: null,
    auraState: createAuraProcessorState(),
  }),
  
  processEvent: (
    state: AuraUptimeResult,
    event: AuraUptimeEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType: StreamType,
    context: ProcessorContext,
  ): void => {
    // Detect encounter transition - finalize all active auras from previous encounter
    if (state.lastEncounterId !== null && state.lastEncounterId !== encounterID) {
      finalizeAllActiveAuras(state);
    }
    state.lastEncounterId = encounterID;

    if (!context.selectedEncounterIds.has(encounterID)) return;
    
    // Track max offset per encounter for calculating active aura uptime
    const currentMax = state.maxOffsetByEncounter.get(encounterID) ?? 0;
    if (event.offsetMilli > currentMax) {
      state.maxOffsetByEncounter.set(encounterID, event.offsetMilli);
    }
    
    if (event.type === "aura") {
      processAuraEvent(state, event, encounterID, context);
    } else if (event.type === "slain") {
      processSlainEvent(state, event, encounterID);
    }
  },
};

function processAuraEvent(
  state: AuraUptimeResult,
  event: AuraProcessorEvent,
  encounterID: string,
  context: ProcessorContext,
): void {
  if (context.selectedEncounterIds.size !== 0 && !context.selectedEncounterIds.has(encounterID)) return;
  if (context.entitySelection.playerIds.size !== 0 && !context.entitySelection.playerIds.has(event.target)) return;
  if (context.entitySelection.enemyIds.size !== 0 && !context.entitySelection.enemyIds.has(event.target)) return;

  const key = activeKey(event.target, event.spellName);
  const auraRef = eventAuraRef(event);
  const wasActive = hasAura(state.auraState, encounterID, event.target, auraRef);

  applyAuraEvent(state.auraState, encounterID, event);

  const isActive = hasAura(state.auraState, encounterID, event.target, auraRef);

  if (wasActive && isActive && event.state === AuraState.Added) {
    const existing = state.activeAuras.get(key);
    if (existing) {
      finalizeActiveAura(state, existing, event.offsetMilli);
    }
    startActiveAura(state, event, encounterID, context);
    return;
  }

  if (!wasActive && isActive) {
    startActiveAura(state, event, encounterID, context);
    return;
  }

  if (wasActive && !isActive) {
    const existing = state.activeAuras.get(key);
    if (existing) {
      finalizeActiveAura(state, existing, event.offsetMilli);
      state.activeAuras.delete(key);
    }
  }
}

function processSlainEvent(
  state: AuraUptimeResult,
  event: SlainProcessorEvent,
  encounterID: string,
): void {
  applyAuraEvent(state.auraState, encounterID, event);
  // When a target dies, finalize any active auras on it
  finalizeAurasOnTarget(state, event.target, event.offsetMilli);
}
