export interface DeepBreathWorldPoint {
  x: number;
  y: number;
}

export interface DeepBreathLane {
  id: "middle" | "southwest_northeast" | "northwest_southeast";
  from: DeepBreathWorldPoint;
  to: DeepBreathWorldPoint;
}

/**
 * Onyxia's three fixed Deep Breath routes in Onyxia's Lair world coordinates.
 * The first two endpoint pairs come directly from recorded unit-position paths;
 * the third is their mirrored diagonal counterpart.
 */
export const ONYXIA_DEEP_BREATH_LANES: readonly DeepBreathLane[] = [
  {
    id: "middle",
    from: { x: 22.9, y: -217.2 },
    to: { x: -65.8, y: -213.8 },
  },
  {
    id: "southwest_northeast",
    from: { x: -63.5, y: -240.1 },
    to: { x: 6.9, y: -180.2 },
  },
  {
    id: "northwest_southeast",
    from: { x: -63.5, y: -180.2 },
    to: { x: 6.9, y: -240.1 },
  },
];

export const DEEP_BREATH_LANE_EXTENSION_YARDS = 18;

/**
 * Onyxia turns around at the fixed route endpoints, but the damaging breath
 * continues past those flight waypoints to the room walls.
 */
export function extendedDeepBreathLane(
  from: DeepBreathWorldPoint,
  to: DeepBreathWorldPoint,
): readonly [DeepBreathWorldPoint, DeepBreathWorldPoint] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [from, to];
  const extensionX = (dx / length) * DEEP_BREATH_LANE_EXTENSION_YARDS;
  const extensionY = (dy / length) * DEEP_BREATH_LANE_EXTENSION_YARDS;
  return [
    { x: from.x - extensionX, y: from.y - extensionY },
    { x: to.x + extensionX, y: to.y + extensionY },
  ];
}

const DEEP_BREATH_ROUTE_SPELLS = new Map<number, { laneId: DeepBreathLane["id"]; reverse: boolean }>([
  [17_086, { laneId: "middle", reverse: false }],
  [21_140, { laneId: "middle", reverse: true }],
  [18_564, { laneId: "southwest_northeast", reverse: false }],
  [18_584, { laneId: "southwest_northeast", reverse: true }],
  [18_596, { laneId: "northwest_southeast", reverse: false }],
  [18_617, { laneId: "northwest_southeast", reverse: true }],
]);

/** Resolves the fixed room-space footprint and travel direction encoded by a Breath spell sequence. */
export function deepBreathLaneForSpell(spellId: number): DirectedDeepBreathLane | null {
  const route = DEEP_BREATH_ROUTE_SPELLS.get(spellId);
  if (!route) return null;
  const lane = ONYXIA_DEEP_BREATH_LANES.find((candidate) => candidate.id === route.laneId);
  if (!lane) return null;
  return route.reverse
    ? { lane, from: lane.to, to: lane.from }
    : { lane, from: lane.from, to: lane.to };
}

export interface DirectedDeepBreathLane {
  lane: DeepBreathLane;
  /** Fixed footprint endpoint where the fire begins. */
  from: DeepBreathWorldPoint;
  /** Opposite endpoint, which the fire travels toward. */
  to: DeepBreathWorldPoint;
}
