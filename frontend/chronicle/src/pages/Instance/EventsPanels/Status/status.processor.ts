import type { StreamType } from "@/hooks/instanceEvents";
import type {
  AbsorbedProcessorEvent,
  DamageProcessorEvent,
  HealProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  ResourceChangeProcessorEvent,
  SlainProcessorEvent,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
} from "../processorTypes";

export type StatusUnitKind = "player" | "pet" | "unit";
export type StatusEventKind = "damage" | "heal" | "absorbed" | "death" | "cast_start" | "cast" | "cast_fail";

export interface StatusTimelineEvent {
  timestampMilli: number;
  offsetMilli: number;
  eventIndex: number;
  kind: StatusEventKind;
  amount: number;
  overheal?: number;
  spellId: number | null;
  label: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  durationMilli?: number;
}

export interface StatusUnitTimeline {
  unitId: string;
  name: string;
  className: string;
  kind: StatusUnitKind;
  ownerId: string | null;
  events: StatusTimelineEvent[];
}

export interface StatusEncounter {
  encounterId: string;
  startMilli: number;
  endMilli: number;
  units: Map<string, StatusUnitTimeline>;
}

export interface StatusResult {
  encounters: Map<string, StatusEncounter>;
}

export type StatusProcessorEvent =
  | DamageProcessorEvent
  | HealProcessorEvent
  | ResourceChangeProcessorEvent
  | AbsorbedProcessorEvent
  | SlainProcessorEvent
  | SpellStartProcessorEvent
  | SpellGoProcessorEvent
  | SpellFailProcessorEvent;

function shortGuid(guid: string): string {
  return guid.length > 12 ? `${guid.slice(0, 6)}…${guid.slice(-4)}` : guid;
}

function resolveUnit(guid: string, context: ProcessorContext): Omit<StatusUnitTimeline, "events"> {
  const player = context.players[guid];
  if (player) {
    return {
      unitId: guid,
      name: player.name,
      className: player.class || "UNKNOWN",
      kind: "player",
      ownerId: null,
    };
  }

  const unit = context.units?.[guid];
  const ownerId = context.unitState?.getOwner(guid) ?? unit?.owner ?? null;
  const owner = ownerId ? context.players[ownerId] : null;
  return {
    unitId: guid,
    name: unit?.name || shortGuid(guid),
    className: owner?.class || "UNKNOWN",
    kind: owner ? "pet" : "unit",
    ownerId,
  };
}

function getEncounter(state: StatusResult, encounterId: string, firstTimestamp: Date): StatusEncounter {
  let encounter = state.encounters.get(encounterId);
  if (!encounter) {
    const startMilli = firstTimestamp.getTime();
    encounter = { encounterId, startMilli, endMilli: startMilli, units: new Map() };
    state.encounters.set(encounterId, encounter);
  }
  return encounter;
}

function pushEvent(
  state: StatusResult,
  encounterId: string,
  firstTimestamp: Date,
  unitId: string,
  event: StatusTimelineEvent,
  context: ProcessorContext,
): void {
  if (!unitId) return;
  const encounter = getEncounter(state, encounterId, firstTimestamp);
  let unit = encounter.units.get(unitId);
  if (!unit) {
    unit = { ...resolveUnit(unitId, context), events: [] };
    encounter.units.set(unitId, unit);
  }
  unit.events.push(event);
  encounter.endMilli = Math.max(encounter.endMilli, event.timestampMilli);
}

function baseEvent(
  event: StatusProcessorEvent,
  firstTimestamp: Date,
): Pick<StatusTimelineEvent, "timestampMilli" | "offsetMilli" | "eventIndex"> {
  return {
    timestampMilli: firstTimestamp.getTime() + event.offsetMilli,
    offsetMilli: event.offsetMilli,
    eventIndex: event.index,
  };
}

export const statusProcessor: PanelProcessor<StatusResult, StatusProcessorEvent> = {
  id: "status",
  streams: ["damage", "heal", "resource_change", "absorbed", "slain", "spell_start", "spell_go", "spell_fail"] as StreamType[],
  createState: () => ({ encounters: new Map() }),
  processEvent(state, event, encounterId, firstTimestamp, _streamType, context) {
    if (!context.selectedEncounterIds.has(encounterId)) return;
    const base = baseEvent(event, firstTimestamp);

    switch (event.type) {
      case "damage":
        pushEvent(state, encounterId, firstTimestamp, event.target, {
          ...base,
          kind: "damage",
          amount: Math.max(0, event.amount),
          spellId: event.spellId,
          label: event.sourceName || "Damage",
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || event.sourceName,
          targetId: event.target,
        }, context);
        return;
      case "heal":
        pushEvent(state, encounterId, firstTimestamp, event.target, {
          ...base,
          kind: "heal",
          amount: Math.max(0, event.amount),
          overheal: Math.max(0, event.overheal),
          spellId: event.spellId,
          label: event.sourceName || "Healing",
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || event.sourceName,
          targetId: event.target,
        }, context);
        return;
      case "resource_change":
        if (event.resourceType.toLowerCase() !== "health" || event.amount <= 0) return;
        pushEvent(state, encounterId, firstTimestamp, event.target, {
          ...base,
          kind: "heal",
          amount: event.amount,
          spellId: null,
          label: event.sourceName || "Health restored",
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || event.sourceName,
          targetId: event.target,
        }, context);
        return;
      case "absorbed":
        pushEvent(state, encounterId, firstTimestamp, event.target, {
          ...base,
          kind: "absorbed",
          amount: Math.max(0, event.amount),
          spellId: event.absorbSpellId,
          label: event.absorbSpellName || "Absorb",
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || event.absorbSpellName || "Absorb",
          targetId: event.target,
        }, context);
        return;
      case "slain":
        pushEvent(state, encounterId, firstTimestamp, event.target, {
          ...base,
          kind: "death",
          amount: event.attribution?.amount ?? 0,
          spellId: null,
          label: event.attribution?.sourceName || "Slain",
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || "Unknown",
          targetId: event.target,
        }, context);
        return;
      case "spell_start":
        pushEvent(state, encounterId, firstTimestamp, event.caster, {
          ...base,
          kind: "cast_start",
          amount: 0,
          spellId: event.spell.id,
          label: event.spell.name,
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || shortGuid(event.caster),
          targetId: event.target,
          durationMilli: Math.max(event.castTimeMilli, event.channelTimeMilli, 0),
        }, context);
        return;
      case "spell_go":
        pushEvent(state, encounterId, firstTimestamp, event.caster, {
          ...base,
          kind: "cast",
          amount: 0,
          spellId: event.spell.id,
          label: event.spell.name,
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || shortGuid(event.caster),
          targetId: event.target,
        }, context);
        return;
      case "spell_fail":
        pushEvent(state, encounterId, firstTimestamp, event.caster, {
          ...base,
          kind: "cast_fail",
          amount: 0,
          spellId: event.spell.id,
          label: event.spell.name,
          sourceId: event.caster,
          sourceName: context.players[event.caster]?.name || context.units?.[event.caster]?.name || shortGuid(event.caster),
          targetId: "",
        }, context);
    }
  },
};
