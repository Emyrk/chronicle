export const LIVE_SESSION_QUERY_PARAM = "live";

export interface LiveReplayState {
  enabled: boolean;
  timestampMs: number | null;
  isPlaying: boolean;
  playbackSpeed: number;
}

/**
 * Where someone is on the 3D map: their orbit camera (`position` is the
 * camera, `target` what it looks at) or, in walk mode, their character
 * (`position` is the feet, `target` a point ahead of it). Scene coordinates,
 * shared only between views on the same `ground` (the dungeon mesh).
 */
export interface LiveMapPresence {
  ground: string;
  mode: "camera" | "walk";
  position: [number, number, number];
  target: [number, number, number];
}

export type LiveSessionDataMessage<TView = unknown> =
  | { type: "view"; view: TView }
  | { type: "replay"; replay: LiveReplayState }
  | { type: "pointer"; participantId?: string; surfaceId?: string; x: number; y: number }
  | { type: "presence"; participantId?: string; presence: LiveMapPresence | null };

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

/** A peer's presence, or null when it is malformed (or cleared). */
export function parseMapPresence(value: unknown): LiveMapPresence | null {
  if (!value || typeof value !== "object") return null;
  const { ground, mode, position, target } = value as Partial<LiveMapPresence>;
  if (typeof ground !== "string" || ground.length === 0 || ground.length > 2048) return null;
  if (mode !== "camera" && mode !== "walk") return null;
  if (!isVector3(position) || !isVector3(target)) return null;
  return { ground, mode, position: [...position], target: [...target] };
}

/** A participant's hue (degrees), shared by their cursor and their map presence. */
export function participantHue(participantId: string): number {
  let hash = 0;
  for (const char of participantId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export function participantColor(participantId: string): string {
  return `hsl(${participantHue(participantId)} 80% 60%)`;
}

/** A participant's short name, as their cursor shows it. */
export function participantLabel(participantId: string): string {
  return participantId === "leader" ? "Leader" : participantId.slice(0, 6);
}

export type LiveSessionSignalPayload =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

export type LiveSessionServerMessage =
  | { type: "participant_joined"; participant_id: string }
  | { type: "participant_left"; participant_id: string }
  | { type: "session_ended"; reason?: string }
  | { type: "signal"; participant_id: string; payload: LiveSessionSignalPayload };

interface CursorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function cursorSurfaceOffset(
  clientX: number,
  clientY: number,
  rect: CursorRect,
): { x: number; y: number } {
  return {
    x: Math.max(0, clientX - rect.left),
    y: Math.max(0, clientY - rect.top),
  };
}

export function cursorScreenPosition(
  x: number,
  y: number,
  rect: CursorRect,
): { x: number; y: number } {
  return {
    x: rect.left + Math.min(Math.max(0, x), rect.width),
    y: rect.top + Math.min(Math.max(0, y), rect.height),
  };
}

export function liveSessionInviteURL(currentURL: string, code: string): string {
  const url = new URL(currentURL);
  url.searchParams.set(LIVE_SESSION_QUERY_PARAM, code);
  url.searchParams.delete("import");
  return url.toString();
}

export function websocketURL(path: string, location: Pick<Location, "protocol" | "host">): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${path}`;
}

export function shouldPublishParticipantReplay(
  previous: LiveReplayState | null,
  next: LiveReplayState,
): boolean {
  if (!previous) return true;
  if (previous.enabled !== next.enabled) return true;
  if (previous.isPlaying !== next.isPlaying) return true;
  if (previous.playbackSpeed !== next.playbackSpeed) return true;
  // While playback is running, timestamp advancement is driven by the leader.
  // Paused seeks remain editable by every participant.
  return !next.isPlaying && previous.timestampMs !== next.timestampMs;
}
