export interface SharedTimeRange {
  startMs: number;
  endMs: number;
}

export function readSharedTimeRange(payload: unknown): SharedTimeRange | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;

  const view = (payload as { view?: unknown }).view;
  if (typeof view !== "object" || view === null || Array.isArray(view)) return null;

  const timeRange = (view as { timeRange?: unknown }).timeRange;
  if (typeof timeRange !== "object" || timeRange === null || Array.isArray(timeRange)) return null;

  const { startMs, endMs } = timeRange as { startMs?: unknown; endMs?: unknown };
  if (
    typeof startMs !== "number" ||
    typeof endMs !== "number" ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    return null;
  }

  return { startMs, endMs };
}

export function sameEncounterSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export function validateSharedViewPayload(
  payload: unknown,
  sharedInstanceID: string,
  loadedInstanceID: string,
): Record<string, unknown> {
  if (sharedInstanceID !== loadedInstanceID) {
    throw new Error("Shared view belongs to a different instance");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Shared view payload is invalid");
  }

  // Legacy payloads may contain the UUID from before an instance was reparsed.
  // The share API's resolved instance ID is authoritative, so ignore embedded IDs.
  return payload as Record<string, unknown>;
}
