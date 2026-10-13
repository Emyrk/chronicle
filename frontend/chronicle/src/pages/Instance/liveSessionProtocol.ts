export const LIVE_SESSION_QUERY_PARAM = "live";

export interface LiveReplayState {
  enabled: boolean;
  timestampMs: number | null;
  isPlaying: boolean;
  playbackSpeed: number;
}

export type LiveSessionDataMessage<TView = unknown> =
  | { type: "view"; view: TView }
  | { type: "replay"; replay: LiveReplayState }
  | { type: "pointer"; participantId?: string; surfaceId?: string; x: number; y: number };

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
