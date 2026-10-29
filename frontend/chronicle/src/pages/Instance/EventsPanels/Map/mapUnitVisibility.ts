interface HiddenMapUnitRule {
  instanceName: string;
  flavor: string;
  entries: ReadonlySet<number>;
}

/**
 * Units whose telemetry is useful to retain, but whose markers are misleading
 * or noisy on a specific map. Keep these rules scoped to the canonical
 * instance name and parser flavor so the same creature entry remains visible
 * everywhere else.
 */
const HIDDEN_MAP_UNIT_RULES: readonly HiddenMapUnitRule[] = [
  {
    instanceName: "Scarlet Monastery",
    flavor: "vanillaplus",
    entries: new Set([25121, 25132]),
  },
];

export function shouldShowMapUnit(
  instanceName: string,
  flavor: readonly string[],
  entry: number | undefined,
  showHiddenUnits = false,
): boolean {
  if (showHiddenUnits || entry === undefined) return true;

  return !HIDDEN_MAP_UNIT_RULES.some((rule) =>
    rule.instanceName === instanceName
    && flavor.includes(rule.flavor)
    && rule.entries.has(entry),
  );
}
