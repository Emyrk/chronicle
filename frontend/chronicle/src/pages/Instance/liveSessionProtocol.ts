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

export interface LiveViewportPresence {
  window: { width: number; height: number };
  panels: Record<string, { width: number; height: number }>;
}

const LIVE_PRESENCE_SURFACE_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,63}$/;

/** A panel-owned presence surface that replaces the generic shared cursor. */
export function parseLivePresenceSurface(value: unknown): string | undefined {
  return typeof value === "string" && LIVE_PRESENCE_SURFACE_PATTERN.test(value) ? value : undefined;
}

export interface LiveViewDelivery<TView = unknown> {
  applier: ((view: TView) => void) | null;
  pending: { view: TView; onApplied?: () => void } | null;
}

export function receiveLiveView<TView>(
  delivery: LiveViewDelivery<TView>,
  view: TView,
  onApplied?: () => void,
): void {
  if (delivery.applier) {
    delivery.applier(view);
    onApplied?.();
    return;
  }
  delivery.pending = { view, onApplied };
}

export function setLiveViewApplier<TView>(
  delivery: LiveViewDelivery<TView>,
  applier: ((view: TView) => void) | null,
): void {
  delivery.applier = applier;
  if (!applier || !delivery.pending) return;
  const { view, onApplied } = delivery.pending;
  delivery.pending = null;
  applier(view);
  onApplied?.();
}

export function liveSnapshotMatchesRequest(
  pendingRequestId: string | null,
  responseRequestId: string | undefined,
): boolean {
  return pendingRequestId !== null && responseRequestId === pendingRequestId;
}

export type LiveSessionDataMessage<TView = unknown> =
  | { type: "view_request"; requestId: string }
  | { type: "view"; view: TView; requestId?: string }
  | { type: "view_ack"; requestId: string }
  | { type: "replay"; replay: LiveReplayState }
  | {
      type: "pointer";
      participantId?: string;
      surfaceId?: string;
      presenceSurface?: string;
      x: number;
      y: number;
      xRatio?: number;
      yRatio?: number;
      surfaceWidth?: number;
      surfaceHeight?: number;
    }
  | { type: "presence"; participantId?: string; presence: LiveMapPresence | null }
  | { type: "viewport_presence"; participantId?: string; viewport: LiveViewportPresence | null };

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

export function parseViewportPresence(value: unknown): LiveViewportPresence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<LiveViewportPresence>;
  const windowSize = candidate.window;
  if (
    !windowSize
    || typeof windowSize.width !== "number"
    || typeof windowSize.height !== "number"
    || !Number.isFinite(windowSize.width)
    || !Number.isFinite(windowSize.height)
    || windowSize.width <= 0
    || windowSize.height <= 0
  ) return null;
  const panels: Record<string, { width: number; height: number }> = {};
  if (candidate.panels && typeof candidate.panels === "object" && !Array.isArray(candidate.panels)) {
    for (const [panelId, dimensions] of Object.entries(candidate.panels).slice(0, 64)) {
      if (!parseLivePresenceSurface(`panel:${panelId}`) || !dimensions || typeof dimensions !== "object") continue;
      const { width, height } = dimensions as { width?: unknown; height?: unknown };
      if (
        typeof width === "number"
        && typeof height === "number"
        && Number.isFinite(width)
        && Number.isFinite(height)
        && width > 0
        && height > 0
      ) panels[panelId] = { width, height };
    }
  }
  return { window: { width: windowSize.width, height: windowSize.height }, panels };
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
  if (participantId === "leader") return "Leader";
  if (participantId.startsWith("user:")) return participantId.slice("user:".length);
  return participantId.slice(0, 6);
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

export type LiveCursorPositionMode = "exact" | "proportional";

export function cursorSurfaceRatio(offset: number, size: number): number | undefined {
  if (!Number.isFinite(offset) || !Number.isFinite(size) || size <= 0) return undefined;
  return Math.min(1, Math.max(0, offset / size));
}

export function cursorScreenPosition(
  x: number,
  y: number,
  rect: CursorRect,
  mode: LiveCursorPositionMode = "exact",
  xRatio?: number,
  yRatio?: number,
): { x: number; y: number } {
  const proportional = mode === "proportional"
    && Number.isFinite(xRatio)
    && Number.isFinite(yRatio);
  return {
    x: rect.left + (proportional
      ? Math.min(1, Math.max(0, xRatio as number)) * rect.width
      : Math.min(Math.max(0, x), rect.width)),
    y: rect.top + (proportional
      ? Math.min(1, Math.max(0, yRatio as number)) * rect.height
      : Math.min(Math.max(0, y), rect.height)),
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

export function canEditLiveSessionState(
  status: "idle" | "connecting" | "live" | "needs_password" | "ended" | "error",
  role: "leader" | "participant" | null,
): boolean {
  return status !== "live" || role !== "participant";
}

export function canPublishLiveView(role: "leader" | "participant" | null): boolean {
  return role === "leader";
}
