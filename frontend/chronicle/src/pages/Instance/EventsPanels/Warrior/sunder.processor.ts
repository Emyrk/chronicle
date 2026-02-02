/**
 * Sunder Armor processor - Tracks Sunder Armor usage by Warriors.
 * 
 * Tracks:
 * - Effective vs ineffective sunders (effective = affliction within 500ms of cast)
 * - Time to 5 sunders on each target (from encounter start)
 * - Which warriors contributed to each target's first 5 sunders
 */

import type { PanelProcessor, CastProcessorEvent, AuraProcessorEvent, ProcessorContext, AuraApplication } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";

/** Spell name to match for Sunder Armor */
const SUNDER_ARMOR_SPELL_NAME = "Sunder Armor";

/** Max time (ms) between cast and affliction for it to count as effective */
const AFFLICTION_WINDOW_MS = 500;

/** Max stacks of Sunder Armor */
const MAX_SUNDER_STACKS = 5;

/** AuraApplication.Gains = 1 */
const AURA_GAINS: AuraApplication = 1;

/** A pending sunder cast waiting for affliction confirmation */
interface PendingSunder {
  timestampMs: number;
  casterGuid: string;
  casterName: string;
  targetGuid: string;
  targetName: string;
  encounterId: string;
}

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
  ineffectiveSunders: number;
  /** Record of targetGuid -> how many of the first 5 stacks this warrior contributed */
  contributionsToFirst5: Record<string, number>;
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
}

/** Result type for the Sunder processor */
export interface SunderResult {
  /** Stats per warrior (guid -> stats) */
  warriors: Record<string, WarriorSunderStats>;
  /** Stats per target (guid -> stats) */
  targets: Record<string, TargetSunderStats>;
  /** All confirmed sunders for detailed view */
  confirmedSunders: ConfirmedSunder[];
  /** Pending casts not yet matched (internal use) */
  _pendingCasts: Record<string, PendingSunder[]>;
  /** Encounter start times for calculating time-to-5-stacks */
  _encounterStarts: Record<string, number>;
  /** Track current stack count per target */
  _targetStacks: Record<string, number>;
}

type SunderEvent = CastProcessorEvent | AuraProcessorEvent;

/**
 * Generate a key for matching casts to afflictions.
 * We match by target GUID since multiple warriors can sunder the same target.
 */
function pendingKey(targetGuid: string): string {
  return targetGuid;
}

/**
 * Sunder processor implementation.
 */
export const sunderProcessor: PanelProcessor<SunderResult, SunderEvent> = {
  id: "sunder",
  streams: ["cast", "aura"] as StreamType[],
  
  createState: (): SunderResult => ({
    warriors: {},
    targets: {},
    confirmedSunders: [],
    _pendingCasts: {},
    _encounterStarts: {},
    _targetStacks: {},
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
    
    if (streamType === "cast" && event.type === "cast") {
      processCastEvent(state, event, timestampMs, encounterID, context);
    } else if (streamType === "aura" && event.type === "aura") {
      processAuraEvent(state, event, timestampMs);
    }
  },
};

function processCastEvent(
  state: SunderResult,
  event: CastProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): void {
  // Only process successful casts (action === 1 is "Casts")
  if (event.action !== 1) return;
  
  // Check if this is a Sunder Armor cast
  if (event.spell.name !== SUNDER_ARMOR_SPELL_NAME) return;
  
  // Filter by selected enemies (if any are selected)
  const { entitySelection } = context;
  if (entitySelection.enemyIds.size > 0 && !entitySelection.enemyIds.has(event.target)) {
    return;
  }
  
  // Get player names
  const casterPlayer = context.players[event.caster];
  const targetUnit = context.units?.[event.target];
  
  const pending: PendingSunder = {
    timestampMs,
    casterGuid: event.caster,
    casterName: casterPlayer?.name ?? event.caster,
    targetGuid: event.target,
    targetName: targetUnit?.name ?? event.target,
    encounterId,
  };
  
  // Store pending cast keyed by target
  const key = pendingKey(event.target);
  if (!(key in state._pendingCasts)) {
    state._pendingCasts[key] = [];
  }
  state._pendingCasts[key].push(pending);
}

function processAuraEvent(
  state: SunderResult,
  event: AuraProcessorEvent,
  timestampMs: number,
): void {
  // Only process "Gains" (afflicted by)
  if (event.application !== AURA_GAINS) return;
  
  // Check if this is a Sunder Armor affliction
  if (event.spellName !== SUNDER_ARMOR_SPELL_NAME) return;
  
  const stackCount = event.amount;
  const targetGuid = event.target;
  const key = pendingKey(targetGuid);
  
  // Find matching pending cast within 500ms window
  const pendingCasts = state._pendingCasts[key];
  if (!pendingCasts || pendingCasts.length === 0) {
    // No pending cast - this affliction doesn't count
    return;
  }
  
  // Find the most recent cast within the window
  let matchedCast: PendingSunder | null = null;
  let matchedIndex = -1;
  
  for (let i = pendingCasts.length - 1; i >= 0; i--) {
    const pending = pendingCasts[i];
    const timeDiff = timestampMs - pending.timestampMs;
    
    if (timeDiff >= 0 && timeDiff <= AFFLICTION_WINDOW_MS) {
      matchedCast = pending;
      matchedIndex = i;
      break;
    }
  }
  
  if (!matchedCast) {
    // No matching cast within window
    return;
  }
  
  // Remove the matched cast from pending
  pendingCasts.splice(matchedIndex, 1);
  
  // Mark any older pending casts on this target as ineffective
  // (they never got an affliction)
  const expiredCasts = pendingCasts.filter(p => 
    timestampMs - p.timestampMs > AFFLICTION_WINDOW_MS
  );
  
  for (const expired of expiredCasts) {
    recordIneffectiveSunder(state, expired);
  }
  
  // Remove expired casts
  state._pendingCasts[key] = pendingCasts.filter(p => 
    timestampMs - p.timestampMs <= AFFLICTION_WINDOW_MS
  );
  
  // Record the effective sunder
  recordEffectiveSunder(state, matchedCast, stackCount);
}

function recordEffectiveSunder(
  state: SunderResult,
  cast: PendingSunder,
  stackCount: number,
): void {
  // Create confirmed sunder
  const confirmed: ConfirmedSunder = {
    ...cast,
    stackCount,
  };
  state.confirmedSunders.push(confirmed);
  
  // Update warrior stats
  let warrior = state.warriors[cast.casterGuid];
  if (!warrior) {
    warrior = {
      guid: cast.casterGuid,
      name: cast.casterName,
      effectiveSunders: 0,
      ineffectiveSunders: 0,
      contributionsToFirst5: {},
    };
    state.warriors[cast.casterGuid] = warrior;
  }
  warrior.effectiveSunders++;
  
  // Update target stats
  let target = state.targets[cast.targetGuid];
  if (!target) {
    target = {
      guid: cast.targetGuid,
      name: cast.targetName,
      encounterId: cast.encounterId,
      timeToFiveStacksMs: null,
      first5Contributors: [],
      totalSunders: 0,
    };
    state.targets[cast.targetGuid] = target;
  }
  target.totalSunders++;
  
  // Track first 5 contributors
  const currentStack = state._targetStacks[cast.targetGuid] ?? 0;
  
  // Only count if this is adding a new stack (stack went up)
  if (stackCount > currentStack && currentStack < MAX_SUNDER_STACKS) {
    state._targetStacks[cast.targetGuid] = stackCount;
    
    // Record contribution for each new stack
    for (let s = currentStack + 1; s <= Math.min(stackCount, MAX_SUNDER_STACKS); s++) {
      target.first5Contributors.push({
        guid: cast.casterGuid,
        name: cast.casterName,
        stackNumber: s,
      });
      
      // Update warrior's contribution count for this target
      const currentContrib = warrior.contributionsToFirst5[cast.targetGuid] ?? 0;
      warrior.contributionsToFirst5[cast.targetGuid] = currentContrib + 1;
    }
    
    // Check if we just reached 5 stacks
    if (stackCount >= MAX_SUNDER_STACKS && target.timeToFiveStacksMs === null) {
      const encounterStartMs = state._encounterStarts[cast.encounterId] ?? cast.timestampMs;
      target.timeToFiveStacksMs = cast.timestampMs - encounterStartMs;
    }
  }
}

function recordIneffectiveSunder(
  state: SunderResult,
  cast: PendingSunder,
): void {
  // Update warrior stats
  let warrior = state.warriors[cast.casterGuid];
  if (!warrior) {
    warrior = {
      guid: cast.casterGuid,
      name: cast.casterName,
      effectiveSunders: 0,
      ineffectiveSunders: 0,
      contributionsToFirst5: {},
    };
    state.warriors[cast.casterGuid] = warrior;
  }
  warrior.ineffectiveSunders++;
}
