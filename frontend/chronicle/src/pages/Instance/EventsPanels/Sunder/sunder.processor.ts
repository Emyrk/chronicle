/**
 * Sunder Armor processor - Tracks Sunder Armor usage by Warriors.
 * 
 * Tracks:
 * - Effective sunders (direct Sunder Armor or Devastate applications below 5 stacks)
 * - Refreshed sunders (applications when already at 5 stacks - counts as ineffective)
 * - Failed sunders (via SPELL_GO with numHits=0, numMisses=1)
 * - Stack reset (via Aura StateRemoved for Sunder Armor)
 * - Time to 5 sunders on each target (from encounter start)
 * - Which warriors contributed to each target's first 5 sunders
 */

import type { PanelProcessor, AuraCastProcessorEvent, SpellGoProcessorEvent, AuraProcessorEvent, SlainProcessorEvent, ProcessorContext, AuraState } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import { createAuraProcessorState, applyAuraEvent, hasAura, type AuraProcessorState } from "../processors/auraProcessor";

/** Sunder Armor spell IDs (ranks 1-7) */
const SUNDER_SPELL_IDS = new Set([7386, 7405, 8380, 11596, 11597, 25225, 47467]);

/** Devastate spell IDs (ranks 1-5). Devastate applies Sunder Armor in Wrath. */
const DEVASTATE_SPELL_IDS = new Set([20243, 30016, 30022, 47497, 47498]);

/** Expose Armor spell IDs (ranks 5-7) */
const EXPOSE_ARMOR_SPELL_IDS = new Set([11198, 26866, 48669]);

/** Armor reduction spell names for aura lifecycle fallback detection */
const SUNDER_ARMOR_SPELL_NAME = "Sunder Armor";
const EXPOSE_ARMOR_SPELL_NAME = "Expose Armor";

/** AURA_CAST effect value indicating sunder application */
const AURA_EFFECT_SUNDER = 6;

/** AURA_CAST effectMiscValue for sunder */
const AURA_EFFECT_MISC_VALUE = 1;

/** AuraState.Removed = 2 */
const AURA_STATE_REMOVED: AuraState = 2;

/** Max stacks of Sunder Armor */
const MAX_SUNDER_STACKS = 5;

/** Maximum delay between a Wrath cast-success event and its aura update. */
const SUNDER_CONFIRMATION_WINDOW_MS = 500;

/** Whether the target currently has any supported rank of Expose Armor. */
function hasExposedArmor(
  state: AuraProcessorState,
  encounterId: string,
  targetGuid: string,
): boolean {
  if (hasAura(state, encounterId, targetGuid, { spellName: EXPOSE_ARMOR_SPELL_NAME })) {
    return true;
  }

  for (const spellId of EXPOSE_ARMOR_SPELL_IDS) {
    if (hasAura(state, encounterId, targetGuid, { spellId })) {
      return true;
    }
  }

  return false;
}

function isSunderArmorAura(event: AuraProcessorEvent): boolean {
  return event.spellName === SUNDER_ARMOR_SPELL_NAME
    || (event.spellId != null && SUNDER_SPELL_IDS.has(event.spellId));
}

function isExposeArmorAura(event: AuraProcessorEvent): boolean {
  return event.spellName === EXPOSE_ARMOR_SPELL_NAME
    || (event.spellId != null && EXPOSE_ARMOR_SPELL_IDS.has(event.spellId));
}

/** Data for a sunder event (used for both effective and ineffective) */
interface SunderEventData {
  timestampMs: number;
  casterGuid: string;
  casterName: string;
  targetGuid: string;
  targetName: string;
  encounterId: string;
}

/** A Wrath cast-success event waiting for a matching aura stack update. */
type PendingSunder = SunderEventData;

/** A confirmed sunder (has affliction) */
export interface ConfirmedSunder {
  timestampMs: number;
  casterGuid: string;
  casterName: string;
  targetGuid: string;
  targetName: string;
  encounterId: string;
  stackCount: number;
}

/** Stats for a single warrior */
export interface WarriorSunderStats {
  guid: string;
  name: string;
  effectiveSunders: number;
  refreshSunders: number;
  failedSunders: number;
  /** Record of targetGuid -> how many of the first 5 stacks this warrior contributed */
  contributionsToFirst5: Record<string, number>;
}

/** Debug event for tracking sunder timeline */
export interface SunderDebugEvent {
  /** Offset from encounter start in ms */
  offsetMs: number;
  /** Type of event */
  type: "landed" | "refreshed" | "failed" | "armor_exposed";
  /** Caster name */
  casterName?: string;
  /** Stack count (for landed/refreshed events) */
  stackCount?: number;
}

/** Stats for a single target */
export interface TargetSunderStats {
  guid: string;
  name: string;
  encounterId: string;
  /** Time in ms from encounter start to reach 5 stacks (null if never reached) */
  timeToFiveStacksMs: number | null;
  /** Ordered list of warriors who applied the first 5 sunders */
  first5Contributors: { guid: string; name: string; stackNumber: number }[];
  /** Total sunders received */
  totalSunders: number;
  /** Debug: timeline of all sunder events on this target */
  debugEvents: SunderDebugEvent[];
}

/** Result type for the Sunder processor */
export interface SunderResult {
  /** Stats per warrior (guid -> stats) */
  warriors: Record<string, WarriorSunderStats>;
  /** Stats per target (guid -> stats) */
  targets: Record<string, TargetSunderStats>;
  /** All confirmed sunders for detailed view */
  confirmedSunders: ConfirmedSunder[];
  /** Encounter start times for calculating time-to-5-stacks */
  _encounterStarts: Record<string, number>;
  /** Track current stack count per target */
  _targetStacks: Record<string, number>;
  /** Aura tracking state for Exposed Armor detection */
  _auraState: AuraProcessorState;
  /** Wrath cast-success events awaiting an aura application or stack update */
  _pendingSunders: PendingSunder[];
}

type SunderEvent = AuraCastProcessorEvent | SpellGoProcessorEvent | AuraProcessorEvent | SlainProcessorEvent;

/**
 * Sunder processor implementation.
 */
export const sunderProcessor: PanelProcessor<SunderResult, SunderEvent> = {
  id: "sunder",
  streams: ["aura_cast", "spell_go", "aura", "slain"] as StreamType[],
  
  createState: (): SunderResult => ({
    warriors: {},
    targets: {},
    confirmedSunders: [],
    _encounterStarts: {},
    _targetStacks: {},
    _auraState: createAuraProcessorState(),
    _pendingSunders: [],
  }),
  
  processEvent: (
    state: SunderResult,
    event: SunderEvent,
    encounterID: string,
    firstTimestamp: Date,
    streamType: StreamType,
    context: ProcessorContext,
  ): void => {
    if (!context.selectedEncounterIds.has(encounterID)) return;
    
    const encounterStartMs = firstTimestamp.getTime();
    
    // Track encounter start time
    if (!(encounterID in state._encounterStarts)) {
      state._encounterStarts[encounterID] = encounterStartMs;
    }
    
    const timestampMs = encounterStartMs + event.offsetMilli;

    expirePendingSunders(state, timestampMs);
    
    // Feed aura/slain events to aura tracker for Exposed Armor detection
    if ((streamType === "aura" && event.type === "aura") || (streamType === "slain" && event.type === "slain")) {
      applyAuraEvent(state._auraState, encounterID, event);
    }
    
    if (streamType === "aura_cast" && event.type === "aura_cast") {
      processAuraCastEvent(state, event, timestampMs, encounterID, context);
    } else if (streamType === "spell_go" && event.type === "spell_go") {
      processSpellGoEvent(state, event, timestampMs, encounterID, context);
    } else if (streamType === "aura" && event.type === "aura") {
      processAuraEvent(state, event, timestampMs, encounterID);
    }
  },
};

/**
 * Process AURA_CAST events - these indicate a sunder landed successfully.
 * 
 * A sunder lands when:
 * - effect === 6
 * - effectMiscValue === 1
 * - spell ID is a supported Sunder Armor rank
 * 
 * If already at 5 stacks, it's a "refresh" (counts as ineffective).
 */
function processAuraCastEvent(
  state: SunderResult,
  event: AuraCastProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): void {
  // Check for sunder landing conditions
  if (event.effect !== AURA_EFFECT_SUNDER) return;
  if (event.effectMiscValue !== AURA_EFFECT_MISC_VALUE) return;
  if (!SUNDER_SPELL_IDS.has(event.spell.id)) return;
  
  // Must have a target
  if (!event.target) return;
  
  // Only track player casters
  const casterPlayer = context.players[event.caster];
  if (!casterPlayer) return;
  
  // Filter by selected enemies (if any are selected)
  const { entitySelection } = context;
  if (entitySelection.enemyIds.size > 0 && !entitySelection.enemyIds.has(event.target)) {
    return;
  }
  
  const targetUnit = context.units?.[event.target];
  const casterName = casterPlayer.name;
  const targetName = targetUnit?.name ?? event.target;
  
  // Calculate offset from encounter start for debug
  const encounterStartMs = state._encounterStarts[encounterId] ?? timestampMs;
  const offsetMs = timestampMs - encounterStartMs;
  
  // Check if target has Exposed Armor — sunders are wasted
  if (hasExposedArmor(state._auraState, encounterId, event.target)) {
    if (!(event.target in state.targets)) {
      state.targets[event.target] = {
        guid: event.target,
        name: targetName,
        encounterId,
        timeToFiveStacksMs: null,
        first5Contributors: [],
        totalSunders: 0,
        debugEvents: [],
      };
    }
    state.targets[event.target].debugEvents.push({
      offsetMs,
      type: "armor_exposed",
      casterName,
    });
    recordFailedSunder(state, {
      timestampMs,
      casterGuid: event.caster,
      casterName,
      targetGuid: event.target,
      targetName,
      encounterId,
    });
    return;
  }
  
  // Ensure target exists
  if (!(event.target in state.targets)) {
    state.targets[event.target] = {
      guid: event.target,
      name: targetName,
      encounterId,
      timeToFiveStacksMs: null,
      first5Contributors: [],
      totalSunders: 0,
      debugEvents: [],
    };
  }
  
  // Track stack count internally (AURA_CAST doesn't provide current stacks)
  const currentStack = state._targetStacks[event.target] ?? 0;
  
  // Check if this is a refresh (already at 5 stacks)
  if (currentStack >= MAX_SUNDER_STACKS) {
    // Log refresh event for debug
    state.targets[event.target].debugEvents.push({
      offsetMs,
      type: "refreshed",
      casterName,
      stackCount: MAX_SUNDER_STACKS,
    });
    
    // Record as a refresh (ineffective)
    recordRefreshSunder(state, {
      timestampMs,
      casterGuid: event.caster,
      casterName,
      targetGuid: event.target,
      targetName,
      encounterId,
    });
    return;
  }
  
  const newStackCount = currentStack + 1;
  
  // Log landed event for debug
  state.targets[event.target].debugEvents.push({
    offsetMs,
    type: "landed",
    casterName,
    stackCount: newStackCount,
  });
  
  // Record the effective sunder
  recordEffectiveSunder(state, {
    timestampMs,
    casterGuid: event.caster,
    casterName,
    targetGuid: event.target,
    targetName,
    encounterId,
  }, newStackCount);
}

/**
 * Process Aura events. Wrath reports Sunder applications and stack changes here,
 * while the accompanying synthetic AuraCast lacks the vanilla effect metadata.
 */
function processAuraEvent(
  state: SunderResult,
  event: AuraProcessorEvent,
  timestampMs: number,
  encounterId: string,
): void {
  if (isSunderArmorAura(event)) {
    if (event.state === AURA_STATE_REMOVED || event.amount <= 0) {
      delete state._targetStacks[event.target];
      return;
    }

    const pendingIndex = state._pendingSunders.findIndex((pending) =>
      pending.encounterId === encounterId
      && pending.targetGuid === event.target
      && timestampMs >= pending.timestampMs
      && timestampMs - pending.timestampMs <= SUNDER_CONFIRMATION_WINDOW_MS
    );
    if (pendingIndex === -1) return;

    const [pending] = state._pendingSunders.splice(pendingIndex, 1);
    const currentStack = state._targetStacks[event.target] ?? 0;
    const stackCount = Math.min(event.amount, MAX_SUNDER_STACKS);
    const target = getOrCreateTarget(state, pending);
    const offsetMs = timestampMs - (state._encounterStarts[encounterId] ?? timestampMs);

    if (stackCount <= currentStack) {
      target.debugEvents.push({
        offsetMs,
        type: "refreshed",
        casterName: pending.casterName,
        stackCount: currentStack,
      });
      recordRefreshSunder(state, pending);
      return;
    }

    target.debugEvents.push({
      offsetMs,
      type: "landed",
      casterName: pending.casterName,
      stackCount,
    });
    recordEffectiveSunder(state, { ...pending, timestampMs }, stackCount);
    return;
  }
  
  // Reset sunder stacks when Expose Armor is applied (mutually exclusive — sunders drop)
  if (isExposeArmorAura(event) && event.state !== AURA_STATE_REMOVED) {
    delete state._targetStacks[event.target];
  }
}

/**
 * Process SPELL_GO events. Vanilla records explicit hit/miss counts. Wrath
 * records cast success as zero hits and zero misses, so those casts wait for a
 * matching aura application or stack update before they are credited.
 */
function processSpellGoEvent(
  state: SunderResult,
  event: SpellGoProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): void {
  if (!SUNDER_SPELL_IDS.has(event.spell.id) && !DEVASTATE_SPELL_IDS.has(event.spell.id)) return;
  if (!event.target) return;
  
  const casterPlayer = context.players[event.caster];
  if (!casterPlayer) return;
  
  const { entitySelection } = context;
  if (entitySelection.enemyIds.size > 0 && !entitySelection.enemyIds.has(event.target)) {
    return;
  }
  
  const targetUnit = context.units?.[event.target];
  const data: SunderEventData = {
    timestampMs,
    casterGuid: event.caster,
    casterName: casterPlayer.name,
    targetGuid: event.target,
    targetName: targetUnit?.name ?? event.target,
    encounterId,
  };

  if (event.numHits === 0 && event.numMisses === 0) {
    state._pendingSunders.push(data);
    return;
  }

  if (event.numHits !== 0 || event.numMisses !== 1) return;

  const target = getOrCreateTarget(state, data);
  const encounterStartMs = state._encounterStarts[encounterId] ?? timestampMs;
  target.debugEvents.push({
    offsetMs: timestampMs - encounterStartMs,
    type: "failed",
    casterName: data.casterName,
  });
  recordFailedSunder(state, data);
}

function expirePendingSunders(state: SunderResult, timestampMs: number): void {
  const stillPending: PendingSunder[] = [];

  for (const pending of state._pendingSunders) {
    if (timestampMs - pending.timestampMs <= SUNDER_CONFIRMATION_WINDOW_MS) {
      stillPending.push(pending);
      continue;
    }

    const target = getOrCreateTarget(state, pending);
    const encounterStartMs = state._encounterStarts[pending.encounterId] ?? pending.timestampMs;
    target.debugEvents.push({
      offsetMs: pending.timestampMs - encounterStartMs,
      type: "failed",
      casterName: pending.casterName,
    });
    recordFailedSunder(state, pending);
  }

  state._pendingSunders = stillPending;
}

function getOrCreateTarget(state: SunderResult, data: SunderEventData): TargetSunderStats {
  let target = state.targets[data.targetGuid];
  if (!target) {
    target = {
      guid: data.targetGuid,
      name: data.targetName,
      encounterId: data.encounterId,
      timeToFiveStacksMs: null,
      first5Contributors: [],
      totalSunders: 0,
      debugEvents: [],
    };
    state.targets[data.targetGuid] = target;
  }
  return target;
}

function getOrCreateWarrior(state: SunderResult, guid: string, name: string): WarriorSunderStats {
  let warrior = state.warriors[guid];
  if (!warrior) {
    warrior = {
      guid,
      name,
      effectiveSunders: 0,
      refreshSunders: 0,
      failedSunders: 0,
      contributionsToFirst5: {},
    };
    state.warriors[guid] = warrior;
  }
  return warrior;
}

function recordEffectiveSunder(
  state: SunderResult,
  data: SunderEventData,
  stackCount: number,
): void {
  // Create confirmed sunder
  const confirmed: ConfirmedSunder = {
    ...data,
    stackCount,
  };
  state.confirmedSunders.push(confirmed);
  
  // Update warrior stats
  const warrior = getOrCreateWarrior(state, data.casterGuid, data.casterName);
  
  // Update target stats
  let target = state.targets[data.targetGuid];
  if (!target) {
    target = {
      guid: data.targetGuid,
      name: data.targetName,
      encounterId: data.encounterId,
      timeToFiveStacksMs: null,
      first5Contributors: [],
      totalSunders: 0,
      debugEvents: [],
    };
    state.targets[data.targetGuid] = target;
  }
  // Track first 5 contributors
  const currentStack = state._targetStacks[data.targetGuid] ?? 0;
  const stacksApplied = Math.max(Math.min(stackCount, MAX_SUNDER_STACKS) - currentStack, 0);
  warrior.effectiveSunders += stacksApplied;
  target.totalSunders += stacksApplied;
  
  // Update to the authoritative stack count reported by the aura event.
  state._targetStacks[data.targetGuid] = stackCount;
  
  // Credit every stack added by this application. Glyph of Devastate can add
  // two stacks from one cast, so the aura's resulting stack count is authoritative.
  const firstAddedStack = Math.max(currentStack + 1, 1);
  const lastAddedStack = Math.min(stackCount, MAX_SUNDER_STACKS);
  for (let addedStack = firstAddedStack; addedStack <= lastAddedStack; addedStack++) {
    target.first5Contributors.push({
      guid: data.casterGuid,
      name: data.casterName,
      stackNumber: addedStack,
    });
  }

  const stacksContributed = Math.max(lastAddedStack - firstAddedStack + 1, 0);
  if (stacksContributed > 0) {
    const currentContrib = warrior.contributionsToFirst5[data.targetGuid] ?? 0;
    warrior.contributionsToFirst5[data.targetGuid] = currentContrib + stacksContributed;
  }

  // Check if this application reached 5 stacks.
  if (currentStack < MAX_SUNDER_STACKS
    && stackCount >= MAX_SUNDER_STACKS
    && target.timeToFiveStacksMs === null) {
    const encounterStartMs = state._encounterStarts[data.encounterId] ?? data.timestampMs;
    target.timeToFiveStacksMs = data.timestampMs - encounterStartMs;
  }
}

function recordRefreshSunder(
  state: SunderResult,
  data: SunderEventData,
): void {
  const warrior = getOrCreateWarrior(state, data.casterGuid, data.casterName);
  warrior.refreshSunders++;
}

function recordFailedSunder(
  state: SunderResult,
  data: SunderEventData,
): void {
  const warrior = getOrCreateWarrior(state, data.casterGuid, data.casterName);
  warrior.failedSunders++;
}
