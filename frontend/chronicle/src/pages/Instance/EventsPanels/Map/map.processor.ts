import {
  HitTypeCrit,
  HitTypeDodge,
  HitTypeEvade,
  HitTypeFullAbsorb,
  HitTypeFullBlock,
  HitTypeFullResist,
  HitTypeImmune,
  HitTypeMainHand,
  HitTypeMiss,
  HitTypeOffHand,
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
  UnitResourcesProcessorEvent,
} from "../processorTypes";
import { latestPositionAt } from "./mapModel";
import {
  addEffectEvent,
  createEncounterEffects,
  type EncounterEffects,
  type ReplayAttackKind,
  type ReplayEffectEvent,
} from "./replayEffects";

export interface MapPositionSample {
  timestampMs: number;
  x: number;
  y: number;
  mapId: number;
  facing: number;
}

export interface MapHealthSample {
  timestampMs: number;
  current: number;
  max: number;
  absorb: number;
}

export interface MapEncounterPositions {
  encounterId: string;
  startMs: number;
  endMs: number;
  positionsByUnit: Map<string, MapPositionSample[]>;
  /** Health changes per unit; a sample is kept only when a value changed. */
  healthByUnit: Map<string, MapHealthSample[]>;
  /** Combat events for the replay effects layer. */
  effects: EncounterEffects;
}

export interface MapResult {
  encounters: Map<string, MapEncounterPositions>;
}

export type MapProcessorEvent =
  | UnitPositionProcessorEvent
  | UnitResourcesProcessorEvent
  | DamageProcessorEvent
  | HealProcessorEvent
  | SpellStartProcessorEvent
  | SpellGoProcessorEvent
  | InterruptProcessorEvent
  | SlainProcessorEvent
  | ResurrectionProcessorEvent;

// Same id the Rotation Timeline uses for auto attacks.
const AUTO_ATTACK_SPELL_ID = 6603;
// Auto Shot and wand Shoot.
const RANGED_AUTO_SPELL_IDS = new Set([75, 5019]);
// chronicleproto School: physical.
const PHYSICAL_SCHOOL = 2;
/** Physical abilities at or within this caster-target distance (yards) count as melee. */
export const MELEE_RANGE_YARDS = 8;
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
    overheal: 0,
    absorbed: 0,
    effective: 0,
    crit: false,
    periodic: false,
    attack: "spell",
    aoe: false,
    castTimeMs: 0,
    spellId: null,
    spellName: "",
  };
}

// Caster-target distance in yards from the latest positions at the event,
// or null when either is unknown or they are on different maps.
function unitDistance(encounter: MapEncounterPositions, source: string, target: string, timestampMs: number): number | null {
  const from = latestPositionAt(encounter.positionsByUnit.get(source) ?? [], timestampMs);
  const to = latestPositionAt(encounter.positionsByUnit.get(target) ?? [], timestampMs);
  if (!from || !to || from.mapId !== to.mapId) return null;
  return Math.hypot(from.x - to.x, from.y - to.y);
}

function classifyAttack(event: DamageProcessorEvent, encounter: MapEncounterPositions, timestampMs: number): ReplayAttackKind {
  const { spellId } = event;
  if (spellId === AUTO_ATTACK_SPELL_ID) return "swing";
  if (spellId != null && RANGED_AUTO_SPELL_IDS.has(spellId)) return "ranged_auto";
  // The vanilla and WotLK parsers flag the weapon hand on swings only.
  if ((event.hitType & (HitTypeMainHand | HitTypeOffHand)) !== 0) return "swing";
  const distance = unitDistance(encounter, event.caster, event.target, timestampMs);
  // No spell data: assume a swing unless the units are clearly apart.
  if (spellId == null) return distance !== null && distance > MELEE_RANGE_YARDS ? "ranged_auto" : "swing";
  if ((event.schools[0] ?? 0) === PHYSICAL_SCHOOL && distance !== null && distance <= MELEE_RANGE_YARDS) return "melee_ability";
  return "spell";
}

// Copies the (reused) stream event into a compact effect event, or null
// when it has no visual.
function toEffectEvent(event: MapProcessorEvent, timestampMs: number, encounter: MapEncounterPositions): ReplayEffectEvent | null {
  switch (event.type) {
    case "damage":
    case "heal": {
      if (event.type === "damage" && (event.hitType & NOT_LANDED) !== 0) return null;
      const fx = effectEvent(timestampMs, event.type, event.caster, event.target);
      fx.school = event.schools[0] ?? 0;
      fx.amount = event.amount;
      if (event.type === "heal") {
        fx.overheal = event.overheal;
        fx.absorbed = event.absorbed;
        fx.effective = Math.max(0, event.amount - event.overheal);
      }
      fx.crit = (event.hitType & HitTypeCrit) !== 0;
      fx.periodic = (event.hitType & HitTypePeriodic) !== 0;
      if (event.type === "damage") fx.attack = classifyAttack(event, encounter, timestampMs);
      fx.spellId = event.spellId;
      fx.spellName = event.sourceName;
      return fx;
    }
    case "spell_start": {
      const fx = effectEvent(timestampMs, "cast_start", event.caster, event.target);
      fx.castTimeMs = event.castTimeMilli;
      fx.spellId = event.spell.id;
      fx.spellName = event.spell.name;
      return fx;
    }
    case "spell_go": {
      const fx = effectEvent(timestampMs, "cast_go", event.caster, event.target);
      fx.aoe = event.numHits > 1;
      fx.spellId = event.spell.id;
      fx.spellName = event.spell.name;
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
  streams: ["unit_position", "unit_resources", "damage", "heal", "spell_start", "spell_go", "interrupt", "slain", "ressurection"],
  createState: () => ({ encounters: new Map() }),
  processEvent: (state, event, encounterId, firstTimestamp, _streamType, context) => {
    if (!context.selectedEncounterIds.has(encounterId)) return;

    const timestampMs = firstTimestamp.getTime() + event.offsetMilli;
    let encounter = state.encounters.get(encounterId);
    if (!encounter) {
      encounter = {
        encounterId,
        startMs: firstTimestamp.getTime(),
        endMs: timestampMs,
        positionsByUnit: new Map(),
        healthByUnit: new Map(),
        effects: createEncounterEffects(),
      };
      state.encounters.set(encounterId, encounter);
    }
    if (event.type === "unit_resources") {
      addHealthSample(encounter.healthByUnit, event, timestampMs);
      return;
    }
    if (event.type !== "unit_position") {
      const fx = toEffectEvent(event, timestampMs, encounter);
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

function addHealthSample(healthByUnit: Map<string, MapHealthSample[]>, event: UnitResourcesProcessorEvent, timestampMs: number) {
  let samples = healthByUnit.get(event.unit);
  if (!samples) {
    samples = [];
    healthByUnit.set(event.unit, samples);
  }
  // Snapshots repeat on every advanced event; keep only changes so the list
  // stays small and the latest sample's time is the last change.
  const last = samples[samples.length - 1];
  if (last && last.current === event.currentHealth && last.max === event.maximumHealth && last.absorb === event.absorb) return;
  samples.push({ timestampMs, current: event.currentHealth, max: event.maximumHealth, absorb: event.absorb });
}
