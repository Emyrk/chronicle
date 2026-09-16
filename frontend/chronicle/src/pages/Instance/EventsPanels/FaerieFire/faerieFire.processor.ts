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
  debugEvents: FaerieFireDebugEvent[];
}

export interface FaerieFireResult {
  druids: Record<string, DruidFaerieFireStats>;
  targets: Record<string, TargetFaerieFireStats>;
  _encounterStarts: Record<string, number>;
  _activeTargets: Record<string, true>;
  _pendingCasts: PendingFaerieFire[];
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

    if (streamType === "aura_cast" && event.type === "aura_cast") {
      processAuraCast(state, event, timestampMs, encounterId, context);
    } else if (streamType === "spell_go" && event.type === "spell_go") {
      processSpellGo(state, event, timestampMs, encounterId, context);
    } else if (streamType === "aura" && event.type === "aura") {
      processAura(state, event, timestampMs, encounterId);
    } else if (streamType === "slain" && event.type === "slain") {
      delete state._activeTargets[targetKey(encounterId, event.target)];
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

  recordSuccessfulCast(state, data);
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
): void {
  if (!isFaerieFireAura(event)) return;

  const key = targetKey(encounterId, event.target);
  if (event.state === AuraState.Removed || event.amount <= 0) {
    delete state._activeTargets[key];
    const target = state.targets[event.target];
    if (target) {
      target.debugEvents.push({
        offsetMs: timestampMs - (state._encounterStarts[encounterId] ?? timestampMs),
        type: "removed",
      });
    }
    return;
  }

  const pendingIndex = state._pendingCasts.findIndex((pending) =>
    pending.encounterId === encounterId
    && pending.targetGuid === event.target
    && timestampMs >= pending.timestampMs
    && timestampMs - pending.timestampMs <= CONFIRMATION_WINDOW_MS
  );
  if (pendingIndex === -1) {
    state._activeTargets[key] = true;
    return;
  }

  const [pending] = state._pendingCasts.splice(pendingIndex, 1);
  recordSuccessfulCast(state, { ...pending, timestampMs });
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
  const wasActive = state._activeTargets[key] === true;

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
    druid.applications++;
    target.applications++;
    if (target.firstApplicationMs === null) {
      target.firstApplicationMs = encounterOffset(state, data);
      target.firstCasterGuid = data.casterGuid;
      target.firstCasterName = data.casterName;
    }
  }

  state._activeTargets[key] = true;
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
    debugEvents: [],
  };
}

function encounterOffset(state: FaerieFireResult, data: FaerieFireEventData): number {
  return data.timestampMs - (state._encounterStarts[data.encounterId] ?? data.timestampMs);
}
