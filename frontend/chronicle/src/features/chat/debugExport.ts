import type { ClientToolRequestEvent, DebugSnapshotEvent } from "./protocol";

export function serializeInferenceDebug(
  snapshots: readonly DebugSnapshotEvent[],
  clientToolRequests: readonly ClientToolRequestEvent[] = [],
  error?: string,
): string {
  return JSON.stringify({
    schemaVersion: 1,
    snapshots,
    clientToolRequests,
    ...(error ? { error } : {}),
  }, null, 2);
}
