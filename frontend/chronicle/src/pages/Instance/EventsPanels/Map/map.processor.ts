import {
  HitTypeCrit,
  HitTypeDodge,
  HitTypeEvade,
  HitTypeFullAbsorb,
  HitTypeFullBlock,
  HitTypeFullResist,
  HitTypeImmune,
  HitTypeMiss,
  HitTypeParry,
  HitTypePeriodic,
  HitTypeReflect,
} from "@/lib/hittype/hittype";
import type {
  DamageProcessorEvent,
  HealProcessorEvent,
  InterruptProcessorEvent,
  PanelProcessor,
  ResurrectionProcessorEvent,
  SlainProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
  UnitPositionProcessorEvent,
} from "../processorTypes";
import { addEffectEvent, createEncounterEffects, type EncounterEffects, type ReplayEffectEvent } from "./replayEffects";

export interface MapPositionSample {
  timestampMs: number;
  x: number;
  y: number;
  mapId: number;
  facing: number;
}

export interface MapEncounterPositions {
  encounterId: string;
  startMs: number;
  endMs: number;
  positionsByUnit: Map<string, MapPositionSample[]>;
  /** Combat events for the replay effects layer. */
  effects: EncounterEffects;
}

export interface MapResult {
  encounters: Map<string, MapEncounterPositions>;
}

export type MapProcessorEvent =
  | UnitPositionProcessorEvent
  | DamageProcessorEvent
  | HealProcessorEvent
  | SpellStartProcessorEvent
  | SpellGoProcessorEvent
  | InterruptProcessorEvent
  | SlainProcessorEvent
  | ResurrectionProcessorEvent;

// Same id the Rotation Timeline uses for auto attacks.
const AUTO_ATTACK_SPELL_ID = 6603;
// Outcomes where nothing landed: no hit wobble.
const NOT_LANDED = HitTypeMiss | HitTypeDodge | HitTypeParry | HitTypeFullResist | HitTypeFullAbsorb
  | HitTypeImmune | HitTypeEvade | HitTypeFullBlock | HitTypeReflect;

function effectEvent(timestampMs: number, kind: ReplayEffectEvent["kind"], source: string, target: string): ReplayEffectEvent {
  return {
    timestampMs,
    kind,
    source,
    target,
    school: 0,
    amount: 0,
    crit: false,
    periodic: false,
    melee: false,
    aoe: false,
    castTimeMs: 0,
    spellId: null,
  };
}

// Copies the (reused) stream event into a compact effect event, or null
// when it has no visual.
function toEffectEvent(event: MapProcessorEvent, timestampMs: number): ReplayEffectEvent | null {
  switch (event.type) {
    case "damage":
    case "heal": {
      if (event.type === "damage" && (event.hitType & NOT_LANDED) !== 0) return null;
      const fx = effectEvent(timestampMs, event.type, event.caster, event.target);
      fx.school = event.schools[0] ?? 0;
      fx.amount = event.amount;
      fx.crit = (event.hitType & HitTypeCrit) !== 0;
      fx.periodic = (event.hitType & HitTypePeriodic) !== 0;
      fx.melee = event.type === "damage" && (event.spellId == null || event.spellId === AUTO_ATTACK_SPELL_ID);
      fx.spellId = event.spellId;
      return fx;
    }
    case "spell_start": {
      const fx = effectEvent(timestampMs, "cast_start", event.caster, event.target);
      fx.castTimeMs = event.castTimeMilli;
      fx.spellId = event.spell.id;
      return fx;
    }
    case "spell_go": {
      const fx = effectEvent(timestampMs, "cast_go", event.caster, event.target);
      fx.aoe = event.numHits > 1;
      fx.spellId = event.spell.id;
      return fx;
    }
    case "interrupt":
      return effectEvent(timestampMs, "interrupt", event.caster, event.target);
    case "slain":
      return effectEvent(timestampMs, "slain", event.caster, event.target);
    case "ressurection":
      return effectEvent(timestampMs, "resurrect", event.source, event.target);
    default:
      return null;
  }
}

export const mapProcessor: PanelProcessor<MapResult, MapProcessorEvent> = {
  id: "map",
  streams: ["unit_position", "damage", "heal", "spell_start", "spell_go", "interrupt", "slain", "ressurection"],
  createState: () => ({ encounters: new Map() }),
  processEvent: (state, event, encounterId, firstTimestamp) => {
    const timestampMs = firstTimestamp.getTime() + event.offsetMilli;
    let encounter = state.encounters.get(encounterId);
    if (!encounter) {
      encounter = {
        encounterId,
        startMs: firstTimestamp.getTime(),
        endMs: timestampMs,
        positionsByUnit: new Map(),
        effects: createEncounterEffects(),
      };
      state.encounters.set(encounterId, encounter);
    }
    if (event.type !== "unit_position") {
      const fx = toEffectEvent(event, timestampMs);
      if (fx) addEffectEvent(encounter.effects, fx);
      return;
    }
    encounter.endMs = Math.max(encounter.endMs, timestampMs);

    let positions = encounter.positionsByUnit.get(event.unit);
    if (!positions) {
      positions = [];
      encounter.positionsByUnit.set(event.unit, positions);
    }
    positions.push({
      timestampMs,
      x: event.x,
      y: event.y,
      mapId: event.mapId,
      facing: event.facing,
    });
  },
};
