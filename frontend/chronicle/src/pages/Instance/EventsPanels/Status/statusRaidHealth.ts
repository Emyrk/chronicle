import type { PlayerLifeTransition } from "../processors/playerLifeState.processor";
import type { StatusTimelineEvent, StatusUnitTimeline } from "./status.processor";
import { compareStatusEvents, RELATIVE_HEALTH_DEATH_RESET_MILLI } from "./statusTimeline";

export interface StatusRaidHealthPoint {
  timestampMilli: number;
  fraction: number;
  dead: boolean;
}

export interface StatusRaidHealthUnitTrack {
  unitId: string;
  estimatedHealthPool: number;
  points: StatusRaidHealthPoint[];
}

export interface StatusRaidHealthModel {
  unitCount: number;
  representativeHealthPool: number;
  tracks: StatusRaidHealthUnitTrack[];
}

export interface StatusRaidHealthSummary {
  percent: number;
  alive: number;
  total: number;
}

export interface StatusRaidHealthBucket {
  startMilli: number;
  endMilli: number;
  percent: number;
}

interface UnitCapacityObservation {
  unit: StatusUnitTimeline;
  deepestDeficit: number;
  deathDeficits: number[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const position = clamp(quantile, 0, 1) * (ordered.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  const weight = position - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function healthDelta(event: StatusTimelineEvent): number {
  if (event.kind === "damage") return -Math.max(0, event.amount);
  if (event.kind === "heal") return Math.max(0, event.amount - Math.max(0, event.overheal ?? 0));
  return 0;
}

function unitWithLifeTransitions(
  unit: StatusUnitTimeline,
  transitions?: readonly PlayerLifeTransition[],
): StatusUnitTimeline {
  if (!transitions) return unit;
  const healthEvents = unit.events.filter((event) =>
    event.kind === "damage" || event.kind === "heal" || event.kind === "absorbed",
  );
  const lifeEvents: StatusTimelineEvent[] = transitions.map((transition) => ({
    timestampMilli: transition.timestampMilli,
    offsetMilli: transition.offsetMilli,
    eventIndex: transition.eventIndex,
    kind: transition.alive ? "cast" : "death",
    amount: 0,
    spellId: null,
    label: transition.reason,
    sourceId: transition.playerId,
    sourceName: unit.name,
    targetId: transition.playerId,
  }));
  return { ...unit, events: [...healthEvents, ...lifeEvents] };
}

function capacityObservation(unit: StatusUnitTimeline): UnitCapacityObservation {
  const ordered = [...unit.events].sort(compareStatusEvents);
  let current = 0;
  let minimum = 0;
  let deepestDeficit = 0;
  const deathDeficits: number[] = [];

  for (const event of ordered) {
    current += healthDelta(event);
    minimum = Math.min(minimum, current);
    deepestDeficit = Math.max(deepestDeficit, -minimum);
    if (event.kind === "death") {
      if (minimum < 0) deathDeficits.push(-minimum);
      current = 0;
      minimum = 0;
    }
  }

  return { unit, deepestDeficit, deathDeficits };
}

function representativePool(observations: UnitCapacityObservation[]): number {
  const deathSamples = observations.flatMap((observation) => observation.deathDeficits).filter((value) => value > 0);
  if (deathSamples.length > 0) return Math.max(1, percentile(deathSamples, 0.5));

  const observedDeficits = observations.map((observation) => observation.deepestDeficit).filter((value) => value > 0);
  if (observedDeficits.length === 0) return 1;
  // Without a death anchor, treat the raid's 75th-percentile deepest observed
  // deficit as roughly two thirds of a representative health pool.
  return Math.max(1, percentile(observedDeficits, 0.75) / 0.65);
}

function healthFraction(current: number, dead: boolean, estimatedHealthPool: number): number {
  if (dead) return 0;
  return clamp(1 + Math.min(0, current) / estimatedHealthPool, 0, 1);
}

function createUnitTrack(
  observation: UnitCapacityObservation,
  estimatedHealthPool: number,
): StatusRaidHealthUnitTrack {
  const orderedEvents = [...observation.unit.events].sort(compareStatusEvents);
  const actions: Array<
    | { kind: "event"; timestampMilli: number; event: StatusTimelineEvent }
    | { kind: "reset"; timestampMilli: number; deathKey: string }
  > = [];

  for (const event of orderedEvents) {
    actions.push({ kind: "event", timestampMilli: event.timestampMilli, event });
    if (event.kind === "death") {
      actions.push({
        kind: "reset",
        timestampMilli: event.timestampMilli + RELATIVE_HEALTH_DEATH_RESET_MILLI,
        deathKey: `${event.timestampMilli}:${event.eventIndex}`,
      });
    }
  }
  actions.sort((a, b) =>
    a.timestampMilli - b.timestampMilli
    || Number(a.kind === "event") - Number(b.kind === "event")
    || (a.kind === "event" && b.kind === "event" ? compareStatusEvents(a.event, b.event) : 0),
  );

  let current = 0;
  let deadSinceMilli: number | null = null;
  const pendingDeathDeltas = new Map<string, number>();
  const points: StatusRaidHealthPoint[] = [];

  const appendPoint = (timestampMilli: number) => {
    const dead = deadSinceMilli !== null;
    const point = { timestampMilli, fraction: healthFraction(current, dead, estimatedHealthPool), dead };
    const previous = points[points.length - 1];
    if (previous?.timestampMilli === timestampMilli) points[points.length - 1] = point;
    else if (!previous || previous.fraction !== point.fraction || previous.dead !== point.dead) points.push(point);
  };

  for (const action of actions) {
    if (action.kind === "reset") {
      const resetCurrent = pendingDeathDeltas.get(action.deathKey);
      if (resetCurrent === undefined) continue;
      current = resetCurrent;
      pendingDeathDeltas.delete(action.deathKey);
      appendPoint(action.timestampMilli);
      continue;
    }

    const event = action.event;
    const delta = healthDelta(event);
    current += delta;
    for (const key of pendingDeathDeltas.keys()) {
      pendingDeathDeltas.set(key, (pendingDeathDeltas.get(key) ?? 0) + delta);
    }
    if (event.kind === "death") {
      deadSinceMilli = event.timestampMilli;
      pendingDeathDeltas.set(`${event.timestampMilli}:${event.eventIndex}`, 0);
    } else if (deadSinceMilli !== null && event.kind === "cast") {
      deadSinceMilli = null;
    }
    appendPoint(event.timestampMilli);
  }

  return { unitId: observation.unit.unitId, estimatedHealthPool, points };
}

export function createStatusRaidHealthModel(
  units: StatusUnitTimeline[],
  lifeTransitionsByPlayer?: ReadonlyMap<string, readonly PlayerLifeTransition[]>,
): StatusRaidHealthModel {
  const normalizedUnits = units.map((unit) => unitWithLifeTransitions(
    unit,
    lifeTransitionsByPlayer?.get(unit.unitId),
  ));
  const observations = normalizedUnits.map(capacityObservation);
  const representativeHealthPool = representativePool(observations);
  const tracks = observations.map((observation) => {
    const deathAnchoredPool = observation.deathDeficits.length > 0
      ? percentile(observation.deathDeficits, 0.5)
      : 0;
    const estimatedHealthPool = deathAnchoredPool > 0
      ? deathAnchoredPool
      : Math.max(representativeHealthPool, observation.deepestDeficit / 0.85);
    return createUnitTrack(observation, Math.max(1, estimatedHealthPool));
  });
  return { unitCount: units.length, representativeHealthPool, tracks };
}

function pointAt(track: StatusRaidHealthUnitTrack, cursorMilli: number): StatusRaidHealthPoint {
  let low = 0;
  let high = track.points.length - 1;
  let match: StatusRaidHealthPoint | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const point = track.points[middle];
    if (point.timestampMilli <= cursorMilli) {
      match = point;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match ?? { timestampMilli: Number.NEGATIVE_INFINITY, fraction: 1, dead: false };
}

export function statusRaidHealthAt(
  model: StatusRaidHealthModel,
  cursorMilli: number,
): StatusRaidHealthSummary {
  if (model.unitCount === 0) return { percent: 0, alive: 0, total: 0 };
  let totalFraction = 0;
  let alive = 0;
  for (const track of model.tracks) {
    const point = pointAt(track, cursorMilli);
    totalFraction += point.fraction;
    if (!point.dead) alive++;
  }
  return {
    percent: totalFraction / model.unitCount * 100,
    alive,
    total: model.unitCount,
  };
}

export function statusRaidHealthTimeline(
  model: StatusRaidHealthModel,
  startMilli: number,
  endMilli: number,
  bucketCount = 80,
): StatusRaidHealthBucket[] {
  if (model.unitCount === 0 || endMilli <= startMilli || bucketCount <= 0) return [];
  const transitions = model.tracks.flatMap((track) => track.points.map((point) => ({
    timestampMilli: point.timestampMilli,
    unitId: track.unitId,
    fraction: point.fraction,
  }))).sort((a, b) => a.timestampMilli - b.timestampMilli || a.unitId.localeCompare(b.unitId));
  const fractions = new Map(model.tracks.map((track) => [track.unitId, 1]));
  let totalFraction = model.unitCount;
  let transitionIndex = 0;

  while (transitionIndex < transitions.length && transitions[transitionIndex].timestampMilli < startMilli) {
    const transition = transitions[transitionIndex++];
    totalFraction += transition.fraction - (fractions.get(transition.unitId) ?? 1);
    fractions.set(transition.unitId, transition.fraction);
  }

  const duration = endMilli - startMilli;
  const buckets: StatusRaidHealthBucket[] = [];
  for (let index = 0; index < bucketCount; index++) {
    const bucketStart = startMilli + duration * index / bucketCount;
    const bucketEnd = startMilli + duration * (index + 1) / bucketCount;
    let minimumFraction = totalFraction;
    while (transitionIndex < transitions.length && transitions[transitionIndex].timestampMilli <= bucketEnd) {
      const transition = transitions[transitionIndex++];
      totalFraction += transition.fraction - (fractions.get(transition.unitId) ?? 1);
      fractions.set(transition.unitId, transition.fraction);
      minimumFraction = Math.min(minimumFraction, totalFraction);
    }
    buckets.push({
      startMilli: bucketStart,
      endMilli: bucketEnd,
      percent: clamp(minimumFraction / model.unitCount * 100, 0, 100),
    });
  }
  return buckets;
}
