import type { StreamType } from "@/hooks/instanceEvents";
import {
  AuraState,
  type AuraCastProcessorEvent,
  type AuraProcessorEvent,
  type PanelProcessor,
  type ProcessorContext,
  type SlainProcessorEvent,
  type SpellGoProcessorEvent,
} from "../processorTypes";

/** Faerie Fire, Faerie Fire (Feral), and legacy Bear ranks used by supported servers. */
const FAERIE_FIRE_SPELL_IDS = new Set([
  770, 778, 9749, 9907,
  16855, 16857, 17387, 17388, 17389, 17390, 17391, 17392,
]);

const FAERIE_FIRE_SPELL_NAMES = new Set([
  "Faerie Fire",
  "Faerie Fire (Bear)",
  "Faerie Fire (Feral)",
]);

const AURA_EFFECT = 6;
const ARMOR_REDUCTION_MISC_VALUE = 1;
const CONFIRMATION_WINDOW_MS = 500;

interface FaerieFireEventData {
  timestampMs: number;
  casterGuid: string;
  casterName: string;
  abilityName: string;
  targetGuid: string;
  targetName: string;
  encounterId: string;
}

type PendingFaerieFire = FaerieFireEventData;

export interface DruidFaerieFireStats {
  guid: string;
  name: string;
  applications: number;
  refreshes: number;
  failures: number;
}

export interface FaerieFireDebugEvent {
  offsetMs: number;
  type: "applied" | "refreshed" | "failed" | "removed";
  casterName?: string;
  abilityName?: string;
}

export interface TargetFaerieFireStats {
  guid: string;
  name: string;
  encounterId: string;
  firstApplicationMs: number | null;
  firstCasterGuid: string | null;
  firstCasterName: string | null;
  applications: number;
  refreshes: number;
  /** Completed Faerie Fire uptime before the current active interval. */
  uptimeMs: number;
  /** Start of the current active interval, relative to encounter start. */
  activeSinceMs: number | null;
  /** Target death offset. Uptime eligibility ends here instead of at encounter end. */
  deathOffsetMs: number | null;
  debugEvents: FaerieFireDebugEvent[];
}

export interface FaerieFireResult {
  druids: Record<string, DruidFaerieFireStats>;
  targets: Record<string, TargetFaerieFireStats>;
  _encounterStarts: Record<string, number>;
  /** Active Faerie Fire start offset by encounter/target key. */
  _activeTargets: Record<string, number>;
  _pendingCasts: PendingFaerieFire[];
  /** Recently counted successes used to deduplicate aura and cast representations. */
  _recentSuccesses: FaerieFireEventData[];
}

type FaerieFireEvent =
  | AuraCastProcessorEvent
  | AuraProcessorEvent
  | SlainProcessorEvent
  | SpellGoProcessorEvent;

export const faerieFireProcessor: PanelProcessor<FaerieFireResult, FaerieFireEvent> = {
  id: "faerie_fire",
  streams: ["aura_cast", "spell_go", "aura", "slain"] as StreamType[],

  createState: (): FaerieFireResult => ({
    druids: {},
    targets: {},
    _encounterStarts: {},
    _activeTargets: {},
    _pendingCasts: [],
    _recentSuccesses: [],
  }),

  processEvent: (
    state,
    event,
    encounterId,
    firstTimestamp,
    streamType,
    context,
  ): void => {
    if (!context.selectedEncounterIds.has(encounterId)) return;

    const encounterStartMs = firstTimestamp.getTime();
    state._encounterStarts[encounterId] ??= encounterStartMs;
    const timestampMs = encounterStartMs + event.offsetMilli;
    expirePendingCasts(state, timestampMs);
    expireRecentSuccesses(state, timestampMs);

    if (streamType === "aura_cast" && event.type === "aura_cast") {
      processAuraCast(state, event, timestampMs, encounterId, context);
    } else if (streamType === "spell_go" && event.type === "spell_go") {
      processSpellGo(state, event, timestampMs, encounterId, context);
    } else if (streamType === "aura" && event.type === "aura") {
      processAura(state, event, timestampMs, encounterId, context);
    } else if (streamType === "slain" && event.type === "slain") {
      processSlain(state, event, timestampMs, encounterId);
    }
  },
};

function isFaerieFireSpell(spellId: number, spellName: string): boolean {
  return FAERIE_FIRE_SPELL_IDS.has(spellId) || FAERIE_FIRE_SPELL_NAMES.has(spellName);
}

function isFaerieFireAura(event: AuraProcessorEvent): boolean {
  return (event.spellId != null && FAERIE_FIRE_SPELL_IDS.has(event.spellId))
    || FAERIE_FIRE_SPELL_NAMES.has(event.spellName);
}

function targetKey(encounterId: string, targetGuid: string): string {
  return `${encounterId}:${targetGuid}`;
}

function processAuraCast(
  state: FaerieFireResult,
  event: AuraCastProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): void {
  if (event.effect !== AURA_EFFECT || event.effectMiscValue !== ARMOR_REDUCTION_MISC_VALUE) return;
  if (!isFaerieFireSpell(event.spell.id, event.spell.name) || !event.target) return;

  const data = eventData(event, timestampMs, encounterId, context);
  if (!data) return;

  // A vanilla AURA_CAST is authoritative. Remove any same-cast pending entry so
  // mixed logs cannot later classify the successful cast as a failure.
  state._pendingCasts = state._pendingCasts.filter((pending) =>
    pending.encounterId !== encounterId
    || pending.casterGuid !== data.casterGuid
    || pending.targetGuid !== data.targetGuid
    || Math.abs(pending.timestampMs - timestampMs) > CONFIRMATION_WINDOW_MS
  );

  if (consumeMatchingRecentSuccess(state, data)) return;
  recordSuccessfulCast(state, data);
  state._recentSuccesses.push(data);
}

function processSpellGo(
  state: FaerieFireResult,
  event: SpellGoProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): void {
  if (!isFaerieFireSpell(event.spell.id, event.spell.name) || !event.target) return;

  const data = eventData(event, timestampMs, encounterId, context);
  if (!data) return;

  if (event.numHits === 0 && event.numMisses === 0) {
    state._pendingCasts.push(data);
    return;
  }

  if (event.numHits === 0 && event.numMisses === 1) {
    getOrCreateTarget(state, data).debugEvents.push({
      offsetMs: encounterOffset(state, data),
      type: "failed",
      casterName: data.casterName,
      abilityName: data.abilityName,
    });
    getOrCreateDruid(state, data).failures++;
  }
}

function processAura(
  state: FaerieFireResult,
  event: AuraProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): void {
  if (!isFaerieFireAura(event)) return;

  const key = targetKey(encounterId, event.target);
  if (event.state === AuraState.Removed || event.amount <= 0) {
    const target = state.targets[event.target];
    if (state._activeTargets[key] !== undefined && target) {
      const offsetMs = timestampMs - (state._encounterStarts[encounterId] ?? timestampMs);
      closeActiveUptime(target, offsetMs);
      target.debugEvents.push({
        offsetMs,
        type: "removed",
      });
    }
    delete state._activeTargets[key];
    return;
  }

  const pendingIndex = state._pendingCasts.findIndex((pending) =>
    pending.encounterId === encounterId
    && pending.targetGuid === event.target
    && timestampMs >= pending.timestampMs
    && timestampMs - pending.timestampMs <= CONFIRMATION_WINDOW_MS
  );
  if (pendingIndex !== -1) {
    const [pending] = state._pendingCasts.splice(pendingIndex, 1);
    const data = { ...pending, timestampMs };
    if (consumeMatchingRecentSuccess(state, data)) return;
    recordSuccessfulCast(state, data);
    state._recentSuccesses.push(data);
    return;
  }

  const data = auraEventData(event, timestampMs, encounterId, context);
  if (data) {
    if (consumeMatchingRecentSuccess(state, data)) return;
    recordSuccessfulCast(state, data);
    state._recentSuccesses.push(data);
    return;
  }

  // Synthetic/pre-existing aura events can still lack caster attribution.
  // Preserve their start time so a later refresh has real uptime.
  state._activeTargets[key] ??= timestampMs - (state._encounterStarts[encounterId] ?? timestampMs);
}

function processSlain(
  state: FaerieFireResult,
  event: SlainProcessorEvent,
  timestampMs: number,
  encounterId: string,
): void {
  const target = state.targets[event.target];
  if (!target || target.encounterId !== encounterId) return;

  const offsetMs = timestampMs - (state._encounterStarts[encounterId] ?? timestampMs);
  target.deathOffsetMs = target.deathOffsetMs === null
    ? offsetMs
    : Math.min(target.deathOffsetMs, offsetMs);
  closeActiveUptime(target, offsetMs);
  delete state._activeTargets[targetKey(encounterId, event.target)];
}

function closeActiveUptime(target: TargetFaerieFireStats, endOffsetMs: number): void {
  if (target.activeSinceMs === null) return;
  target.uptimeMs += Math.max(0, endOffsetMs - target.activeSinceMs);
  target.activeSinceMs = null;
}

export interface FaerieFireUptime {
  uptimeMs: number;
  eligibleMs: number;
  percent: number;
}

/** Calculate uptime against the target's lifetime, ending eligibility at death. */
export function calculateFaerieFireUptime(
  target: TargetFaerieFireStats,
  encounterDurationMs: number,
  targetActiveFromMs = 0,
): FaerieFireUptime {
  const eligibleEndMs = Math.max(
    targetActiveFromMs,
    Math.min(target.deathOffsetMs ?? encounterDurationMs, encounterDurationMs),
  );
  const eligibleMs = Math.max(0, eligibleEndMs - targetActiveFromMs);
  const activeUptimeMs = target.activeSinceMs === null
    ? 0
    : Math.max(0, eligibleEndMs - Math.max(target.activeSinceMs, targetActiveFromMs));
  const uptimeMs = Math.min(eligibleMs, target.uptimeMs + activeUptimeMs);

  return {
    uptimeMs,
    eligibleMs,
    percent: eligibleMs > 0 ? (uptimeMs / eligibleMs) * 100 : 0,
  };
}

function auraEventData(
  event: AuraProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): FaerieFireEventData | null {
  if (!event.caster) return null;

  const caster = context.players[event.caster];
  if (!caster) return null;

  if (context.entitySelection.enemyIds.size > 0
    && !context.entitySelection.enemyIds.has(event.target)) {
    return null;
  }

  return {
    timestampMs,
    casterGuid: event.caster,
    casterName: caster.name,
    abilityName: event.spellName,
    targetGuid: event.target,
    targetName: context.units?.[event.target]?.name ?? event.target,
    encounterId,
  };
}

function consumeMatchingRecentSuccess(
  state: FaerieFireResult,
  data: FaerieFireEventData,
): boolean {
  const matchIndex = state._recentSuccesses.findIndex((success) =>
    success.encounterId === data.encounterId
    && success.casterGuid === data.casterGuid
    && success.targetGuid === data.targetGuid
    && Math.abs(success.timestampMs - data.timestampMs) <= CONFIRMATION_WINDOW_MS
  );
  if (matchIndex === -1) return false;
  state._recentSuccesses.splice(matchIndex, 1);
  return true;
}

function expireRecentSuccesses(state: FaerieFireResult, timestampMs: number): void {
  state._recentSuccesses = state._recentSuccesses.filter(
    (success) => timestampMs - success.timestampMs <= CONFIRMATION_WINDOW_MS,
  );
}

function eventData(
  event: AuraCastProcessorEvent | SpellGoProcessorEvent,
  timestampMs: number,
  encounterId: string,
  context: ProcessorContext,
): FaerieFireEventData | null {
  if (!event.target) return null;

  const caster = context.players[event.caster];
  if (!caster) return null;

  if (context.entitySelection.enemyIds.size > 0
    && !context.entitySelection.enemyIds.has(event.target)) {
    return null;
  }

  return {
    timestampMs,
    casterGuid: event.caster,
    casterName: caster.name,
    abilityName: event.spell.name,
    targetGuid: event.target,
    targetName: context.units?.[event.target]?.name ?? event.target,
    encounterId,
  };
}

function recordSuccessfulCast(state: FaerieFireResult, data: FaerieFireEventData): void {
  const key = targetKey(data.encounterId, data.targetGuid);
  const target = getOrCreateTarget(state, data);
  const druid = getOrCreateDruid(state, data);
  const activeSinceMs = state._activeTargets[key];
  const wasActive = activeSinceMs !== undefined;
  if (wasActive && target.activeSinceMs === null) {
    target.activeSinceMs = activeSinceMs;
  }

  target.debugEvents.push({
    offsetMs: encounterOffset(state, data),
    type: wasActive ? "refreshed" : "applied",
    casterName: data.casterName,
    abilityName: data.abilityName,
  });

  if (wasActive) {
    druid.refreshes++;
    target.refreshes++;
  } else {
    const offsetMs = encounterOffset(state, data);
    druid.applications++;
    target.applications++;
    target.activeSinceMs = offsetMs;
    if (target.firstApplicationMs === null) {
      target.firstApplicationMs = offsetMs;
      target.firstCasterGuid = data.casterGuid;
      target.firstCasterName = data.casterName;
    }
  }

  state._activeTargets[key] = target.activeSinceMs ?? encounterOffset(state, data);
}

function expirePendingCasts(state: FaerieFireResult, timestampMs: number): void {
  const stillPending: PendingFaerieFire[] = [];

  for (const pending of state._pendingCasts) {
    if (timestampMs - pending.timestampMs <= CONFIRMATION_WINDOW_MS) {
      stillPending.push(pending);
      continue;
    }

    getOrCreateTarget(state, pending).debugEvents.push({
      offsetMs: encounterOffset(state, pending),
      type: "failed",
      casterName: pending.casterName,
      abilityName: pending.abilityName,
    });
    getOrCreateDruid(state, pending).failures++;
  }

  state._pendingCasts = stillPending;
}

function getOrCreateDruid(
  state: FaerieFireResult,
  data: FaerieFireEventData,
): DruidFaerieFireStats {
  return state.druids[data.casterGuid] ??= {
    guid: data.casterGuid,
    name: data.casterName,
    applications: 0,
    refreshes: 0,
    failures: 0,
  };
}

function getOrCreateTarget(
  state: FaerieFireResult,
  data: FaerieFireEventData,
): TargetFaerieFireStats {
  return state.targets[data.targetGuid] ??= {
    guid: data.targetGuid,
    name: data.targetName,
    encounterId: data.encounterId,
    firstApplicationMs: null,
    firstCasterGuid: null,
    firstCasterName: null,
    applications: 0,
    refreshes: 0,
    uptimeMs: 0,
    activeSinceMs: null,
    deathOffsetMs: null,
    debugEvents: [],
  };
}

function encounterOffset(state: FaerieFireResult, data: FaerieFireEventData): number {
  return data.timestampMs - (state._encounterStarts[data.encounterId] ?? data.timestampMs);
}
