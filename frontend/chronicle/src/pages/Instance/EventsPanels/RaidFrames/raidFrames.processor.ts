import type {
  HealProcessorEvent,
  PanelProcessor,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
  UnitResourcesProcessorEvent,
} from "../processorTypes";

export interface RaidFrameResourceSample {
  timestampMs: number;
  currentHealth: number;
  maximumHealth: number;
  absorb: number;
  powerType: string;
  currentPower: number;
  maximumPower: number;
}

export interface RaidFrameCast {
  startMs: number;
  endMs: number;
  spellId: number;
  spellName: string;
  channel: boolean;
  failed: boolean;
}

export interface RaidFrameHeal {
  landMs: number;
  amount: number;
  overheal: number;
  spellId: number | null;
  sourceName: string;
}

export interface RaidFramesEncounter {
  encounterId: string;
  startMs: number;
  endMs: number;
  resourcesByUnit: Map<string, RaidFrameResourceSample[]>;
  castsByUnit: Map<string, RaidFrameCast[]>;
  healsByUnit: Map<string, RaidFrameHeal[]>;
}

export interface RaidFramesResult {
  encounters: Map<string, RaidFramesEncounter>;
  /** Spell names seen on casts, used to label heal events (which only carry IDs). */
  spellNames: Map<number, string>;
}

export type RaidFramesProcessorEvent =
  | UnitResourcesProcessorEvent
  | SpellStartProcessorEvent
  | SpellGoProcessorEvent
  | SpellFailProcessorEvent
  | HealProcessorEvent;

function encounterFor(
  state: RaidFramesResult,
  encounterId: string,
  firstTimestamp: Date,
  timestampMs: number,
): RaidFramesEncounter {
  let encounter = state.encounters.get(encounterId);
  if (!encounter) {
    encounter = {
      encounterId,
      startMs: firstTimestamp.getTime(),
      endMs: timestampMs,
      resourcesByUnit: new Map(),
      castsByUnit: new Map(),
      healsByUnit: new Map(),
    };
    state.encounters.set(encounterId, encounter);
  }
  encounter.endMs = Math.max(encounter.endMs, timestampMs);
  return encounter;
}

function addResourceSample(
  encounter: RaidFramesEncounter,
  event: UnitResourcesProcessorEvent,
  timestampMs: number,
): void {
  let samples = encounter.resourcesByUnit.get(event.unit);
  if (!samples) {
    samples = [];
    encounter.resourcesByUnit.set(event.unit, samples);
  }

  const sample: RaidFrameResourceSample = {
    timestampMs,
    currentHealth: event.currentHealth,
    maximumHealth: event.maximumHealth,
    absorb: event.absorb,
    powerType: event.powerType.toLowerCase(),
    currentPower: event.currentPower,
    maximumPower: event.maximumPower,
  };
  const previous = samples[samples.length - 1];
  if (
    previous &&
    previous.currentHealth === sample.currentHealth &&
    previous.maximumHealth === sample.maximumHealth &&
    previous.absorb === sample.absorb &&
    previous.powerType === sample.powerType &&
    previous.currentPower === sample.currentPower &&
    previous.maximumPower === sample.maximumPower
  ) {
    return;
  }
  samples.push(sample);
}

function addCast(
  encounter: RaidFramesEncounter,
  event: SpellStartProcessorEvent,
  timestampMs: number,
): void {
  const durationMs = Math.max(event.castTimeMilli, event.channelTimeMilli, 0);
  if (durationMs <= 0) return;

  let casts = encounter.castsByUnit.get(event.caster);
  if (!casts) {
    casts = [];
    encounter.castsByUnit.set(event.caster, casts);
  }
  casts.push({
    startMs: timestampMs,
    endMs: timestampMs + durationMs,
    spellId: event.spell.id,
    spellName: event.spell.name,
    channel: event.channelTimeMilli > 0,
    failed: false,
  });
}

function finishCast(
  encounter: RaidFramesEncounter,
  caster: string,
  spellId: number,
  timestampMs: number,
  failed: boolean,
): void {
  const casts = encounter.castsByUnit.get(caster);
  if (!casts) return;

  for (let index = casts.length - 1; index >= 0; index -= 1) {
    const cast = casts[index];
    if (cast.spellId !== spellId || timestampMs < cast.startMs || timestampMs > cast.endMs) continue;
    cast.endMs = timestampMs;
    cast.failed = failed;
    return;
  }
}

export const raidFramesProcessor: PanelProcessor<RaidFramesResult, RaidFramesProcessorEvent> = {
  id: "raid_frames",
  streams: ["unit_resources", "spell_start", "spell_go", "spell_fail", "heal"],
  createState: () => ({ encounters: new Map(), spellNames: new Map() }),
  // Every unit is recorded (enemies included) so inspect views can show any
  // unit; the raid frame grid itself shows players.
  processEvent(state, event, encounterId, firstTimestamp, _streamType, context) {
    if (!context.selectedEncounterIds.has(encounterId)) return;

    const timestampMs = firstTimestamp.getTime() + event.offsetMilli;
    const encounter = encounterFor(state, encounterId, firstTimestamp, timestampMs);

    switch (event.type) {
      case "unit_resources":
        addResourceSample(encounter, event, timestampMs);
        return;
      case "spell_start":
        state.spellNames.set(event.spell.id, event.spell.name);
        addCast(encounter, event, timestampMs);
        return;
      case "spell_go":
        state.spellNames.set(event.spell.id, event.spell.name);
        finishCast(encounter, event.caster, event.spell.id, timestampMs, false);
        return;
      case "spell_fail":
        finishCast(encounter, event.caster, event.spell.id, timestampMs, true);
        return;
      case "heal":
        if (event.amount > 0) addHeal(encounter, event, timestampMs);
        return;
    }
  },
};

function addHeal(
  encounter: RaidFramesEncounter,
  event: HealProcessorEvent,
  timestampMs: number,
): void {
  let heals = encounter.healsByUnit.get(event.target);
  if (!heals) {
    heals = [];
    encounter.healsByUnit.set(event.target, heals);
  }
  heals.push({
    landMs: timestampMs,
    amount: event.amount,
    overheal: event.overheal,
    spellId: event.spellId,
    sourceName: event.sourceName,
  });
}

/** Heals that land after fromMs and no later than fromMs + windowMs. */
export function incomingHealsAt(
  heals: readonly RaidFrameHeal[],
  fromMs: number,
  windowMs: number,
): RaidFrameHeal[] {
  let low = 0;
  let high = heals.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (heals[middle].landMs <= fromMs) low = middle + 1;
    else high = middle;
  }
  const incoming: RaidFrameHeal[] = [];
  for (let index = low; index < heals.length && heals[index].landMs <= fromMs + windowMs; index += 1) {
    incoming.push(heals[index]);
  }
  return incoming;
}

export function latestResourceAt(
  samples: readonly RaidFrameResourceSample[],
  timestampMs: number,
): RaidFrameResourceSample | null {
  let low = 0;
  let high = samples.length - 1;
  let latest: RaidFrameResourceSample | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const sample = samples[middle];
    if (sample.timestampMs <= timestampMs) {
      latest = sample;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return latest;
}

export function activeCastAt(
  casts: readonly RaidFrameCast[],
  timestampMs: number,
): RaidFrameCast | null {
  for (let index = casts.length - 1; index >= 0; index -= 1) {
    const cast = casts[index];
    if (cast.startMs <= timestampMs && timestampMs < cast.endMs) return cast;
  }
  return null;
}
