interface MapUnitRule {
  instanceName: string;
  flavor: string;
  entries: ReadonlySet<number>;
}

interface TransientMapUnitRule extends MapUnitRule {
  maxPositionAgeMs: number;
}

/**
 * Units whose telemetry is useful to retain, but whose markers are misleading
 * or noisy on a specific map. Keep these rules scoped to the canonical
 * instance name and parser flavor so the same creature entry remains visible
 * everywhere else.
 */
const HIDDEN_MAP_UNIT_RULES: readonly MapUnitRule[] = [
  {
    instanceName: "Scarlet Monastery",
    flavor: "vanillaplus",
    entries: new Set([25121, 25132]),
  },
];

/**
 * Short-lived units whose final position sample marks the end of their useful
 * map lifetime. Without an age limit, replayPositionAt holds that final sample
 * for the rest of the encounter and leaves their markers behind.
 */
const TRANSIENT_MAP_UNIT_RULES: readonly TransientMapUnitRule[] = [
  {
    instanceName: "Blackwing Lair",
    flavor: "nightmare-of-ursol",
    entries: new Set([65151]), // Shadowflame Spark
    maxPositionAgeMs: 500,
  },
];

function matchesRule(
  rule: MapUnitRule,
  instanceName: string,
  flavor: readonly string[],
  entry: number | undefined,
): boolean {
  return entry !== undefined
    && rule.instanceName === instanceName
    && flavor.includes(rule.flavor)
    && rule.entries.has(entry);
}

/** Fixture-authored absolute expiry for static objects that turn into units. */
export function isMapUnitDespawned(despawnAtMs: number | undefined, cursorMs: number): boolean {
  return despawnAtMs !== undefined && cursorMs >= despawnAtMs;
}

export function shouldShowMapUnit(
  instanceName: string,
  flavor: readonly string[],
  entry: number | undefined,
  showHiddenUnits = false,
): boolean {
  if (showHiddenUnits || entry === undefined) return true;

  return !HIDDEN_MAP_UNIT_RULES.some((rule) => matchesRule(rule, instanceName, flavor, entry));
}

/** Maximum time a transient unit may remain on the map after its last position sample. */
export function mapUnitMaxPositionAgeMs(
  instanceName: string,
  flavor: readonly string[],
  entry: number | undefined,
): number | null {
  return TRANSIENT_MAP_UNIT_RULES.find((rule) => matchesRule(rule, instanceName, flavor, entry))
    ?.maxPositionAgeMs ?? null;
}

export function isMapUnitPositionExpired(
  instanceName: string,
  flavor: readonly string[],
  entry: number | undefined,
  positionTimestampMs: number,
  cursorMs: number,
): boolean {
  const maxPositionAgeMs = mapUnitMaxPositionAgeMs(instanceName, flavor, entry);
  return maxPositionAgeMs !== null && cursorMs - positionTimestampMs > maxPositionAgeMs;
}
