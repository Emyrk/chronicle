export interface ReplayBounds {
  start: Date;
  end: Date;
}

export function stripReplayProgress(
  enabled: boolean,
  currentTimestamp: Date | null,
  bounds: ReplayBounds | null,
): number | null {
  if (!enabled || !currentTimestamp || !bounds) return null;
  const start = bounds.start.getTime();
  const duration = Math.max(1, bounds.end.getTime() - start);
  return Math.max(0, Math.min(1, (currentTimestamp.getTime() - start) / duration));
}
