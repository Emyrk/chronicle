export function compassRotationDegrees(northRadians: number): number {
  return (northRadians * 180) / Math.PI;
}

/** Continues a wrapped angle along the shortest arc instead of jumping at ±π. */
export function unwrapCompassRadians(previous: number, nextWrapped: number): number {
  if (!Number.isFinite(previous)) return nextWrapped;
  const delta = Math.atan2(Math.sin(nextWrapped - previous), Math.cos(nextWrapped - previous));
  return previous + delta;
}
