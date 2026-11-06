import type { StreamType } from "./types";

export interface EventStreamLocation {
  storage?: string;
  baseUrl?: string;
  path?: string;
}

export function getStreamEndpoint(
  instanceId: string,
  type: StreamType,
  location: EventStreamLocation = {},
): string {
  if (location.storage === "r2" && location.baseUrl && location.path) {
    return `${location.baseUrl.replace(/\/$/, "")}/${location.path.replace(/^\//, "")}/${type}`;
  }
  return `/api/v1/raidlogs/instances/${instanceId}/events/${type}`;
}
