import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import type { CreateLiveSessionResponse, JoinLiveSessionResponse } from "@/api/typesGenerated";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSyncModeContext } from "./SyncModeContext";
import {
  LIVE_SESSION_QUERY_PARAM,
  canEditLiveSessionState,
  canPublishLiveView,
  cursorScreenPosition,
  cursorSurfaceOffset,
  cursorSurfaceRatio,
  liveSessionInviteURL,
  liveSnapshotMatchesRequest,
  parseLivePresenceSurface,
  parseMapPresence,
  parseViewportPresence,
  participantColor,
  participantLabel,
  receiveLiveView,
  shouldApplyLiveView,
  setLiveViewApplier,
  websocketURL,
  type LiveCursorPositionMode,
  type LiveMapPresence,
  type LiveReplayState,
  type LiveSessionDataMessage,
  type LiveSessionServerMessage,
  type LiveSessionSignalPayload,
  type LiveViewDelivery,
  type LiveViewportPresence,
} from "./liveSessionProtocol";

import {
  moveLivePresenceParticipant,
  type LivePresenceSurfaceParticipants,
} from "./livePresenceSurfaces";

const liveSessionLeaderID = "leader";
const MAX_SIGNAL_BYTES = 64 * 1024;
const SNAPSHOT_RETRY_MS = 1500;
// Peers resend their map presence every couple of seconds; one silent for
// longer than this has left the map (or lost the connection).
const PRESENCE_STALE_MS = 6000;
const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type LiveSessionRole = "leader" | "participant";
export type LiveSessionStatus = "idle" | "connecting" | "live" | "needs_password" | "ended" | "error";

interface RemotePointer {
  participantId: string;
  surfaceId?: string;
  presenceSurface?: string;
  x: number;
  y: number;
  xRatio?: number;
  yRatio?: number;
  surfaceWidth?: number;
  surfaceHeight?: number;
}

export interface LiveViewboxSettings {
  showViewboxes: boolean;
  showLabels: boolean;
  showCommonArea: boolean;
  cursorPositionMode?: LiveCursorPositionMode;
}

const DEFAULT_VIEWBOX_SETTINGS: LiveViewboxSettings = {
  showViewboxes: false,
  showLabels: true,
  showCommonArea: false,
  cursorPositionMode: "proportional",
};

interface LiveSessionContextValue {
  status: LiveSessionStatus;
  role: LiveSessionRole | null;
  code: string | null;
  inviteURL: string | null;
  participantCount: number;
  viewSynchronized: boolean;
  canEditSharedView: boolean;
  error: string | null;
  create: (instanceId: string, password?: string) => Promise<string>;
  join: (code: string, instanceId: string, password?: string) => Promise<void>;
  leave: () => void;
  resyncView: () => void;
  publishView: (view: unknown) => void;
  registerViewApplier: (apply: ((view: unknown) => void) | null) => void;
  /** Shares where you are on the 3D map with everyone else (null: not on it). */
  publishMapPresence: (presence: LiveMapPresence | null) => void;
  /**
   * Everyone else's map presence, by participant, pushed on every change
   * (without re-rendering the page). Returns the unsubscribe.
   */
  subscribeMapPresence: (listener: MapPresenceListener) => () => void;
  /** Remote participants whose pointer is inside each panel-owned presence surface. */
  presenceSurfaceParticipants: LivePresenceSurfaceParticipants;
  viewportPresences: Readonly<Record<string, LiveViewportPresence>>;
  viewboxSettings: LiveViewboxSettings;
  setViewboxSettings: (value: LiveViewboxSettings | ((previous: LiveViewboxSettings) => LiveViewboxSettings)) => void;
}

export type MapPresenceListener = (presences: ReadonlyMap<string, LiveMapPresence>) => void;

const LiveSessionContext = createContext<LiveSessionContextValue | null>(null);

function responseError(response: Response, fallback: string): Promise<Error> {
  return response.json()
    .then((body: { message?: string }) => new Error(body.message || fallback))
    .catch(() => new Error(fallback));
}

function parseServerMessage(raw: string): LiveSessionServerMessage | null {
  if (raw.length > MAX_SIGNAL_BYTES) return null;
  try {
    const value = JSON.parse(raw) as LiveSessionServerMessage;
    return value && typeof value === "object" && typeof value.type === "string" ? value : null;
  } catch {
    return null;
  }
}

function liveCursorSurface(surfaceId: string | undefined): HTMLElement | null {
  if (!surfaceId) return null;
  return document.querySelector<HTMLElement>(`[data-live-cursor-surface="${CSS.escape(surfaceId)}"]`);
}

function pointerScreenPosition(
  pointer: RemotePointer,
  mode: LiveCursorPositionMode,
): { x: number; y: number } {
  const surface = liveCursorSurface(pointer.surfaceId);
  if (!surface) {
    return {
      x: Math.min(pointer.x, window.innerWidth),
      y: Math.min(pointer.y, window.innerHeight),
    };
  }
  return cursorScreenPosition(
    pointer.x,
    pointer.y,
    surface.getBoundingClientRect(),
    mode,
    pointer.xRatio,
    pointer.yRatio,
  );
}

function RemoteCursor({
  pointer,
  layoutVersion,
  mode,
}: {
  pointer: RemotePointer;
  layoutVersion: number;
  mode: LiveCursorPositionMode;
}) {
  if (pointer.presenceSurface) return null;
  const position = pointerScreenPosition(pointer, mode);
  return (
    <div
      data-cursor-layout-version={layoutVersion}
      className="pointer-events-none fixed left-0 top-0 z-[300] transition-transform duration-100"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div
        className="h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-tl-full rounded-tr-full rounded-bl-full shadow-lg"
        style={{ backgroundColor: participantColor(pointer.participantId) }}
      />
      <span
        className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium text-black shadow"
        style={{ backgroundColor: participantColor(pointer.participantId) }}
      >
        {participantLabel(pointer.participantId)}
      </span>
    </div>
  );
}

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCode = searchParams.get(LIVE_SESSION_QUERY_PARAM);
  const {
    enabled: replayEnabled,
    currentTimestamp: replayTimestamp,
    isPlaying: replayPlaying,
    playbackSpeed: replaySpeed,
    setReadOnly: setReplayReadOnly,
    applyAuthoritativeState: applyAuthoritativeReplayState,
  } = useSyncModeContext();
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [role, setRole] = useState<LiveSessionRole | null>(null);
  const [code, setCode] = useState<string | null>(requestedCode);
  const [inviteURL, setInviteURL] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [viewSynchronized, setViewSynchronized] = useState(false);
  const [remotePointers, setRemotePointers] = useState<Record<string, RemotePointer>>({});
  const [presenceSurfaceParticipants, setPresenceSurfaceParticipants] = useState<LivePresenceSurfaceParticipants>({});
  const [viewportPresences, setViewportPresences] = useState<Record<string, LiveViewportPresence>>({});
  const [viewboxSettings, setViewboxSettings] = useLocalStorage("live-viewbox-settings", DEFAULT_VIEWBOX_SETTINGS);
  const [cursorLayoutVersion, setCursorLayoutVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canEditSharedView = canEditLiveSessionState(status, role);

  useLayoutEffect(() => {
    setReplayReadOnly(!canEditSharedView);
    return () => setReplayReadOnly(false);
  }, [canEditSharedView, setReplayReadOnly]);

  const socketRef = useRef<WebSocket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const channelsRef = useRef(new Map<string, RTCDataChannel>());
  const participantPeerRef = useRef<RTCPeerConnection | null>(null);
  const participantChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const closingSocketRef = useRef(false);
  const currentRoleRef = useRef<LiveSessionRole | null>(null);
  const currentViewRef = useRef<unknown>(null);
  const viewDeliveryRef = useRef<LiveViewDelivery>({ applier: null, pending: null });
  const pendingSnapshotRequestIdRef = useRef<string | null>(null);
  const snapshotRetryTimerRef = useRef<number | null>(null);
  const participantSnapshotRequestsRef = useRef(new Map<string, string>());
  const lastAppliedViewJSONRef = useRef<string | null>(null);
  const remoteViewJSONRef = useRef<string | null>(null);
  // A participant must first adopt the leader's view. Otherwise its local default
  // can win the data-channel startup race and reset the layout for every peer.
  const hasReceivedInitialViewRef = useRef(false);
  const remoteReplayJSONRef = useRef<string | null>(null);
  const presencesRef = useRef(new Map<string, { presence: LiveMapPresence; at: number }>());
  const viewportPresencesRef = useRef(new Map<string, { viewport: LiveViewportPresence; at: number }>());
  const presenceListenersRef = useRef(new Set<MapPresenceListener>());
  const pointerSurfacesRef = useRef(new Map<string, string>());

  const notifyPresence = useCallback(() => {
    const presences = new Map<string, LiveMapPresence>();
    for (const [participantId, entry] of presencesRef.current) presences.set(participantId, entry.presence);
    for (const listener of presenceListenersRef.current) listener(presences);
  }, []);

  const setRemotePresence = useCallback((participantId: string, presence: LiveMapPresence | null) => {
    if (presence) presencesRef.current.set(participantId, { presence, at: performance.now() });
    else if (!presencesRef.current.delete(participantId)) return;
    notifyPresence();
  }, [notifyPresence]);

  const setRemoteViewportPresence = useCallback((participantId: string, viewport: LiveViewportPresence | null) => {
    if (viewport) viewportPresencesRef.current.set(participantId, { viewport, at: performance.now() });
    else viewportPresencesRef.current.delete(participantId);
    setViewportPresences(Object.fromEntries(
      Array.from(viewportPresencesRef.current, ([id, entry]) => [id, entry.viewport]),
    ));
  }, []);

  const setRemotePointerSurface = useCallback((participantId: string, nextSurface: string | undefined) => {
    const previousSurface = pointerSurfacesRef.current.get(participantId);
    if (previousSurface === nextSurface) return;
    if (nextSurface) pointerSurfacesRef.current.set(participantId, nextSurface);
    else pointerSurfacesRef.current.delete(participantId);
    setPresenceSurfaceParticipants((current) =>
      moveLivePresenceParticipant(current, participantId, previousSurface, nextSurface));
  }, []);

  const replayState = useMemo<LiveReplayState>(() => ({
    enabled: replayEnabled,
    timestampMs: replayTimestamp?.getTime() ?? null,
    isPlaying: replayPlaying,
    playbackSpeed: replaySpeed,
  }), [replayEnabled, replayPlaying, replaySpeed, replayTimestamp]);
  const replayStateRef = useRef(replayState);
  useEffect(() => {
    replayStateRef.current = replayState;
  }, [replayState]);

  const pauseAuthoritativeReplay = useCallback(() => {
    const current = replayStateRef.current;
    applyAuthoritativeReplayState({
      enabled: current.enabled,
      currentTimestamp: current.timestampMs === null ? null : new Date(current.timestampMs),
      isPlaying: false,
      playbackSpeed: current.playbackSpeed,
    });
  }, [applyAuthoritativeReplayState]);

  const sendSignal = useCallback((targetID: string | undefined, payload: LiveSessionSignalPayload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "signal", ...(targetID ? { target_id: targetID } : {}), payload }));
  }, []);

  const sendData = useCallback((message: LiveSessionDataMessage, exceptID?: string) => {
    const encoded = JSON.stringify(message);
    if (currentRoleRef.current === "leader") {
      for (const [participantID, channel] of channelsRef.current) {
        if (participantID !== exceptID && channel.readyState === "open") channel.send(encoded);
      }
      return;
    }
    const channel = participantChannelRef.current;
    if (channel?.readyState === "open") channel.send(encoded);
  }, []);

  const clearSnapshotRetry = useCallback(() => {
    if (snapshotRetryTimerRef.current !== null) {
      window.clearTimeout(snapshotRetryTimerRef.current);
      snapshotRetryTimerRef.current = null;
    }
  }, []);

  const scheduleSnapshotRetry = useCallback((requestId: string) => {
    clearSnapshotRetry();
    const retry = () => {
      if (
        currentRoleRef.current !== "participant"
        || pendingSnapshotRequestIdRef.current !== requestId
      ) return;
      const channel = participantChannelRef.current;
      if (channel?.readyState === "open") {
        channel.send(JSON.stringify({ type: "view_request", requestId } satisfies LiveSessionDataMessage));
      }
      snapshotRetryTimerRef.current = window.setTimeout(retry, SNAPSHOT_RETRY_MS);
    };
    snapshotRetryTimerRef.current = window.setTimeout(retry, SNAPSHOT_RETRY_MS);
  }, [clearSnapshotRetry]);

  const resyncView = useCallback(() => {
    if (currentRoleRef.current !== "participant") return;
    const channel = participantChannelRef.current;
    if (channel?.readyState !== "open") return;
    const requestId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    pendingSnapshotRequestIdRef.current = requestId;
    hasReceivedInitialViewRef.current = false;
    lastAppliedViewJSONRef.current = null;
    viewDeliveryRef.current.pending = null;
    setViewSynchronized(false);
    channel.send(JSON.stringify({ type: "view_request", requestId } satisfies LiveSessionDataMessage));
    scheduleSnapshotRetry(requestId);
  }, [scheduleSnapshotRetry]);

  const applyRemoteReplay = useCallback((next: LiveReplayState) => {
    remoteReplayJSONRef.current = JSON.stringify(next);
    applyAuthoritativeReplayState({
      enabled: next.enabled,
      currentTimestamp: next.timestampMs === null ? null : new Date(next.timestampMs),
      isPlaying: next.isPlaying,
      playbackSpeed: next.playbackSpeed,
    });
  }, [applyAuthoritativeReplayState]);

  const handleDataMessage = useCallback((raw: string, senderID?: string) => {
    if (raw.length > MAX_SIGNAL_BYTES) return;
    try {
      const message = JSON.parse(raw) as LiveSessionDataMessage;
      if (message.type === "view_request") {
        if (
          currentRoleRef.current !== "leader"
          || !senderID
          || typeof message.requestId !== "string"
          || message.requestId.length === 0
          || currentViewRef.current === null
        ) return;
        const channel = channelsRef.current.get(senderID);
        if (channel?.readyState !== "open") return;
        participantSnapshotRequestsRef.current.set(senderID, message.requestId);
        channel.send(JSON.stringify({
          type: "view",
          view: currentViewRef.current,
          requestId: message.requestId,
        } satisfies LiveSessionDataMessage));
        return;
      }
      if (message.type === "view_ack") {
        if (
          currentRoleRef.current === "leader"
          && senderID
          && participantSnapshotRequestsRef.current.get(senderID) === message.requestId
        ) {
          participantSnapshotRequestsRef.current.delete(senderID);
        }
        return;
      }
      if (message.type === "view") {
        if (currentRoleRef.current === "participant") {
          const pendingRequestId = pendingSnapshotRequestIdRef.current;
          if (message.requestId !== undefined && !liveSnapshotMatchesRequest(pendingRequestId, message.requestId)) return;
          const snapshotRequestId = liveSnapshotMatchesRequest(pendingRequestId, message.requestId)
            ? pendingRequestId
            : null;
          const viewJSON = JSON.stringify(message.view);
          if (!shouldApplyLiveView(lastAppliedViewJSONRef.current, viewJSON, message.requestId)) return;
          currentViewRef.current = message.view;
          lastAppliedViewJSONRef.current = viewJSON;
          remoteViewJSONRef.current = viewJSON;
          receiveLiveView(viewDeliveryRef.current, message.view, snapshotRequestId ? () => {
            if (pendingSnapshotRequestIdRef.current !== snapshotRequestId) return;
            clearSnapshotRetry();
            pendingSnapshotRequestIdRef.current = null;
            hasReceivedInitialViewRef.current = true;
            setViewSynchronized(true);
            sendData({ type: "view_ack", requestId: snapshotRequestId });
          } : undefined);
          return;
        }
        currentViewRef.current = message.view;
        remoteViewJSONRef.current = JSON.stringify(message.view);
        receiveLiveView(viewDeliveryRef.current, message.view);
        if (currentRoleRef.current === "leader") sendData(message, senderID);
        return;
      }
      if (message.type === "replay") {
        applyRemoteReplay(message.replay);
      } else if (message.type === "pointer") {
        const participantId = senderID ?? message.participantId;
        if (!participantId || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
        const presenceSurface = parseLivePresenceSurface(message.presenceSurface);
        const xRatio = typeof message.xRatio === "number" && Number.isFinite(message.xRatio)
          ? Math.min(1, Math.max(0, message.xRatio))
          : undefined;
        const yRatio = typeof message.yRatio === "number" && Number.isFinite(message.yRatio)
          ? Math.min(1, Math.max(0, message.yRatio))
          : undefined;
        const pointer = {
          participantId,
          ...(typeof message.surfaceId === "string" ? { surfaceId: message.surfaceId } : {}),
          ...(presenceSurface ? { presenceSurface } : {}),
          ...(xRatio !== undefined ? { xRatio } : {}),
          ...(yRatio !== undefined ? { yRatio } : {}),
          ...(typeof message.surfaceWidth === "number" && Number.isFinite(message.surfaceWidth) && message.surfaceWidth > 0
            ? { surfaceWidth: message.surfaceWidth }
            : {}),
          ...(typeof message.surfaceHeight === "number" && Number.isFinite(message.surfaceHeight) && message.surfaceHeight > 0
            ? { surfaceHeight: message.surfaceHeight }
            : {}),
          x: Math.max(0, message.x),
          y: Math.max(0, message.y),
        };
        setRemotePointerSurface(participantId, presenceSurface);
        setRemotePointers((previous) => ({ ...previous, [participantId]: pointer }));
        if (currentRoleRef.current === "leader") {
          sendData({ type: "pointer", ...pointer }, senderID);
        }
        return;
      } else if (message.type === "presence") {
        const participantId = senderID ?? message.participantId;
        if (!participantId) return;
        const presence = parseMapPresence(message.presence);
        setRemotePresence(participantId, presence);
        if (currentRoleRef.current === "leader") {
          sendData({ type: "presence", participantId, presence }, senderID);
        }
        return;
      } else if (message.type === "viewport_presence") {
        const participantId = senderID ?? message.participantId;
        if (!participantId) return;
        const viewport = parseViewportPresence(message.viewport);
        setRemoteViewportPresence(participantId, viewport);
        if (currentRoleRef.current === "leader") {
          sendData({ type: "viewport_presence", participantId, viewport }, senderID);
        }
        return;
      } else {
        return;
      }
      if (currentRoleRef.current === "leader") sendData(message, senderID);
    } catch {
      // Ignore malformed peer messages in the proof of concept.
    }
  }, [applyRemoteReplay, clearSnapshotRetry, sendData, setRemotePointerSurface, setRemotePresence, setRemoteViewportPresence]);

  const configureChannel = useCallback((channel: RTCDataChannel, participantID?: string) => {
    channel.onopen = () => {
      setStatus("live");
      if (currentRoleRef.current === "leader") {
        channel.send(JSON.stringify({ type: "replay", replay: replayStateRef.current } satisfies LiveSessionDataMessage));
      } else {
        resyncView();
      }
    };
    channel.onmessage = (event) => {
      if (typeof event.data === "string") handleDataMessage(event.data, participantID);
    };
    channel.onclose = () => {
      if (currentRoleRef.current === "participant") {
        clearSnapshotRetry();
        pendingSnapshotRequestIdRef.current = null;
        hasReceivedInitialViewRef.current = false;
        setViewSynchronized(false);
        pauseAuthoritativeReplay();
        setStatus("ended");
      }
    };
  }, [clearSnapshotRetry, handleDataMessage, pauseAuthoritativeReplay, resyncView]);

  const createLeaderPeer = useCallback(async (participantID: string) => {
    const peer = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
    peersRef.current.set(participantID, peer);
    const channel = peer.createDataChannel("chronicle-live", { ordered: true });
    channelsRef.current.set(participantID, channel);
    configureChannel(channel, participantID);
    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal(participantID, { candidate: event.candidate.toJSON() });
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal(participantID, { description: offer });
  }, [configureChannel, sendSignal]);

  const ensureParticipantPeer = useCallback(() => {
    if (participantPeerRef.current) return participantPeerRef.current;
    const peer = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
    participantPeerRef.current = peer;
    peer.ondatachannel = (event) => {
      participantChannelRef.current = event.channel;
      configureChannel(event.channel);
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal(undefined, { candidate: event.candidate.toJSON() });
    };
    return peer;
  }, [configureChannel, sendSignal]);

  const closeTransport = useCallback(() => {
    closingSocketRef.current = true;
    socketRef.current?.close();
    socketRef.current = null;
    for (const channel of channelsRef.current.values()) channel.close();
    channelsRef.current.clear();
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    participantChannelRef.current?.close();
    participantChannelRef.current = null;
    participantPeerRef.current?.close();
    participantPeerRef.current = null;
    pendingCandidatesRef.current.clear();
    clearSnapshotRetry();
    pendingSnapshotRequestIdRef.current = null;
    participantSnapshotRequestsRef.current.clear();
    hasReceivedInitialViewRef.current = false;
    lastAppliedViewJSONRef.current = null;
    viewDeliveryRef.current.pending = null;
    setViewSynchronized(false);
    setParticipantCount(0);
    setRemotePointers({});
    pointerSurfacesRef.current.clear();
    setPresenceSurfaceParticipants({});
    viewportPresencesRef.current.clear();
    setViewportPresences({});
    if (presencesRef.current.size > 0) {
      presencesRef.current.clear();
      notifyPresence();
    }
  }, [clearSnapshotRetry, notifyPresence]);

  const connectSocket = useCallback((roomCode: string, token: string, nextRole: LiveSessionRole, remoteURL?: string) => {
    closeTransport();
    closingSocketRef.current = false;
    currentRoleRef.current = nextRole;
    setRole(nextRole);
    setViewSynchronized(nextRole === "leader");
    setCode(roomCode);
    setStatus("connecting");
    setError(null);

    const endpoint = new URL(remoteURL ?? websocketURL(
      `/api/v1/live-sessions/${encodeURIComponent(roomCode)}/ws`,
      window.location,
    ));
    endpoint.searchParams.set("token", token);
    const socket = new WebSocket(endpoint);
    socketRef.current = socket;
    socket.onopen = () => {
      if (nextRole === "leader") setStatus("live");
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === "participant_joined" && nextRole === "leader") {
        setParticipantCount((count) => count + 1);
        void createLeaderPeer(message.participant_id);
      } else if (message.type === "participant_left" && nextRole === "leader") {
        channelsRef.current.get(message.participant_id)?.close();
        channelsRef.current.delete(message.participant_id);
        peersRef.current.get(message.participant_id)?.close();
        peersRef.current.delete(message.participant_id);
        pendingCandidatesRef.current.delete(message.participant_id);
        participantSnapshotRequestsRef.current.delete(message.participant_id);
        setRemotePointers((previous) => {
          const next = { ...previous };
          delete next[message.participant_id];
          return next;
        });
        setParticipantCount((count) => Math.max(0, count - 1));
        setRemotePointerSurface(message.participant_id, undefined);
        setRemotePresence(message.participant_id, null);
        setRemoteViewportPresence(message.participant_id, null);
        // Tell everyone else they are gone too.
        sendData({ type: "presence", participantId: message.participant_id, presence: null });
        sendData({ type: "viewport_presence", participantId: message.participant_id, viewport: null });
      } else if (message.type === "session_ended") {
        pauseAuthoritativeReplay();
        closeTransport();
        setStatus("ended");
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous);
          next.delete(LIVE_SESSION_QUERY_PARAM);
          return next;
        }, { replace: true });
      } else if (message.type === "signal") {
        void (async () => {
          const peer = nextRole === "leader"
            ? peersRef.current.get(message.participant_id)
            : ensureParticipantPeer();
          if (!peer) return;
          const peerKey = nextRole === "leader" ? message.participant_id : liveSessionLeaderID;
          if ("description" in message.payload) {
            await peer.setRemoteDescription(message.payload.description);
            const pending = pendingCandidatesRef.current.get(peerKey) ?? [];
            pendingCandidatesRef.current.delete(peerKey);
            for (const candidate of pending) await peer.addIceCandidate(candidate);
            if (nextRole === "participant" && message.payload.description.type === "offer") {
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              sendSignal(undefined, { description: answer });
            }
          } else if ("candidate" in message.payload) {
            if (peer.remoteDescription) {
              await peer.addIceCandidate(message.payload.candidate);
            } else {
              const pending = pendingCandidatesRef.current.get(peerKey) ?? [];
              pending.push(message.payload.candidate);
              pendingCandidatesRef.current.set(peerKey, pending);
            }
          }
        })().catch(() => setError("WebRTC negotiation failed"));
      }
    };
    socket.onclose = () => {
      if (socketRef.current !== socket || closingSocketRef.current) return;
      pauseAuthoritativeReplay();
      closeTransport();
      setStatus(nextRole === "participant" ? "ended" : "error");
      if (nextRole === "leader") setError("The live signaling connection closed");
    };
    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      setError("Could not connect to the live session");
      setStatus("error");
    };
  }, [closeTransport, createLeaderPeer, ensureParticipantPeer, pauseAuthoritativeReplay, sendData, sendSignal, setRemotePointerSurface, setRemotePresence, setRemoteViewportPresence, setSearchParams]);

  const create = useCallback(async (instanceId: string, password?: string) => {
    const response = await fetch("/api/v1/live-sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: instanceId, ...(password ? { password } : {}) }),
    });
    if (!response.ok) throw await responseError(response, "Failed to create live session");
    const created = await response.json() as CreateLiveSessionResponse;
    const nextInviteURL = liveSessionInviteURL(window.location.href, created.code);
    setInviteURL(nextInviteURL);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(LIVE_SESSION_QUERY_PARAM, created.code);
      next.delete("import");
      return next;
    }, { replace: true });
    connectSocket(created.code, created.leader_token, "leader", created.websocket_url);
    return nextInviteURL;
  }, [connectSocket, setSearchParams]);

  const join = useCallback(async (roomCode: string, instanceId: string, password?: string) => {
    setStatus("connecting");
    setError(null);
    const response = await fetch(`/api/v1/live-sessions/${encodeURIComponent(roomCode)}/join`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(password ? { password } : {}) }),
    });
    if (response.status === 401 || response.status === 403) {
      setStatus("needs_password");
      throw new Error("This live session requires a password");
    }
    if (!response.ok) {
      const joinError = await responseError(response, "Failed to join live session");
      setError(joinError.message);
      setStatus("error");
      throw joinError;
    }
    const joined = await response.json() as JoinLiveSessionResponse;
    if (joined.instance_id !== instanceId) {
      const mismatch = new Error("This live session belongs to a different instance");
      setError(mismatch.message);
      setStatus("error");
      throw mismatch;
    }
    setInviteURL(liveSessionInviteURL(window.location.href, roomCode));
    connectSocket(roomCode, joined.participant_token, "participant", joined.websocket_url);
  }, [connectSocket]);

  const leave = useCallback(() => {
    currentRoleRef.current = null;
    closeTransport();
    setRole(null);
    setCode(null);
    setInviteURL(null);
    setStatus("idle");
    setError(null);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete(LIVE_SESSION_QUERY_PARAM);
      return next;
    }, { replace: true });
  }, [closeTransport, setSearchParams]);

  const publishView = useCallback((view: unknown) => {
    currentViewRef.current = view;
    const encoded = JSON.stringify(view);
    if (remoteViewJSONRef.current === encoded) {
      remoteViewJSONRef.current = null;
      return;
    }
    if (
      status === "live"
      && canPublishLiveView(currentRoleRef.current)
    ) {
      sendData({ type: "view", view });
    }
  }, [sendData, status]);

  const registerViewApplier = useCallback((apply: ((view: unknown) => void) | null) => {
    setLiveViewApplier(viewDeliveryRef.current, apply);
  }, []);

  const publishMapPresence = useCallback((presence: LiveMapPresence | null) => {
    if (status !== "live") return;
    sendData({ type: "presence", ...(role === "leader" ? { participantId: liveSessionLeaderID } : {}), presence });
  }, [role, sendData, status]);

  const subscribeMapPresence = useCallback((listener: MapPresenceListener) => {
    presenceListenersRef.current.add(listener);
    if (presencesRef.current.size > 0) notifyPresence();
    return () => {
      presenceListenersRef.current.delete(listener);
    };
  }, [notifyPresence]);

  // Drop presences that stopped arriving (their heartbeat is a couple of seconds).
  useEffect(() => {
    if (status !== "live") return;
    const interval = window.setInterval(() => {
      const now = performance.now();
      let changed = false;
      for (const [participantId, entry] of presencesRef.current) {
        if (now - entry.at < PRESENCE_STALE_MS) continue;
        presencesRef.current.delete(participantId);
        changed = true;
      }
      if (changed) notifyPresence();
      let viewportsChanged = false;
      for (const [participantId, entry] of viewportPresencesRef.current) {
        if (now - entry.at < PRESENCE_STALE_MS) continue;
        viewportPresencesRef.current.delete(participantId);
        viewportsChanged = true;
      }
      if (viewportsChanged) {
        setViewportPresences(Object.fromEntries(
          Array.from(viewportPresencesRef.current, ([id, entry]) => [id, entry.viewport]),
        ));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [notifyPresence, status]);

  useEffect(() => {
    const encoded = JSON.stringify(replayState);
    if (remoteReplayJSONRef.current === encoded) {
      remoteReplayJSONRef.current = null;
      return;
    }
    if (status === "live" && role === "leader") {
      sendData({ type: "replay", replay: replayState });
    }
  }, [replayState, role, sendData, status]);

  useEffect(() => {
    if (status !== "live") return;
    let timeout: number | null = null;
    const observed = new WeakSet<Element>();
    const collect = (): LiveViewportPresence => {
      const panels: LiveViewportPresence["panels"] = {};
      for (const element of document.querySelectorAll<HTMLElement>("[data-live-panel-viewport]")) {
        const panelId = element.dataset.livePanelViewport;
        if (!panelId || !parseLivePresenceSurface(`panel:${panelId}`)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        panels[panelId] = { width: rect.width, height: rect.height };
      }
      return { window: { width: window.innerWidth, height: window.innerHeight }, panels };
    };
    const publish = () => {
      timeout = null;
      sendData({
        type: "viewport_presence",
        ...(role === "leader" ? { participantId: liveSessionLeaderID } : {}),
        viewport: collect(),
      });
    };
    const schedule = () => {
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = window.setTimeout(publish, 150);
    };
    const resizeObserver = new ResizeObserver(schedule);
    const observePanels = () => {
      for (const element of document.querySelectorAll("[data-live-panel-viewport]")) {
        if (observed.has(element)) continue;
        observed.add(element);
        resizeObserver.observe(element);
      }
      schedule();
    };
    const mutationObserver = new MutationObserver(observePanels);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-live-panel-viewport"],
    });
    window.addEventListener("resize", schedule, { passive: true });
    observePanels();
    const heartbeat = window.setInterval(publish, 2000);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.clearInterval(heartbeat);
      window.removeEventListener("resize", schedule);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      sendData({
        type: "viewport_presence",
        ...(role === "leader" ? { participantId: liveSessionLeaderID } : {}),
        viewport: null,
      });
    };
  }, [role, sendData, status]);

  useEffect(() => () => closeTransport(), [closeTransport]);

  useEffect(() => {
    if (status !== "live") return;
    let lastSentAt = 0;
    const handlePointerMove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - lastSentAt < 100) return;
      lastSentAt = now;
      const eventTarget = event.target instanceof Element ? event.target : null;
      const presenceSurface = parseLivePresenceSurface(
        eventTarget?.closest<HTMLElement>("[data-live-presence-surface]")?.dataset.livePresenceSurface,
      );
      const surface = eventTarget?.closest<HTMLElement>("[data-live-cursor-surface]")
        ?? document.querySelector<HTMLElement>("[data-live-cursor-surface=instance]");
      const rect = surface?.getBoundingClientRect();
      const offset = rect
        ? cursorSurfaceOffset(event.clientX, event.clientY, rect)
        : { x: event.clientX, y: event.clientY };
      const xRatio = rect ? cursorSurfaceRatio(offset.x, rect.width) : undefined;
      const yRatio = rect ? cursorSurfaceRatio(offset.y, rect.height) : undefined;
      const pointer = {
        type: "pointer" as const,
        ...(role === "leader" ? { participantId: "leader" } : {}),
        ...(surface?.dataset.liveCursorSurface ? { surfaceId: surface.dataset.liveCursorSurface } : {}),
        ...(presenceSurface ? { presenceSurface } : {}),
        ...(xRatio !== undefined ? { xRatio } : {}),
        ...(yRatio !== undefined ? { yRatio } : {}),
        ...(rect && rect.width > 0 ? { surfaceWidth: rect.width } : {}),
        ...(rect && rect.height > 0 ? { surfaceHeight: rect.height } : {}),
        ...offset,
      };
      sendData(pointer);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [role, sendData, status]);

  useEffect(() => {
    const updateCursorLayout = () => setCursorLayoutVersion((version) => version + 1);
    window.addEventListener("resize", updateCursorLayout);
    window.addEventListener("scroll", updateCursorLayout, true);
    return () => {
      window.removeEventListener("resize", updateCursorLayout);
      window.removeEventListener("scroll", updateCursorLayout, true);
    };
  }, []);

  const value = useMemo<LiveSessionContextValue>(() => ({
    status,
    role,
    code,
    inviteURL,
    participantCount,
    viewSynchronized,
    canEditSharedView,
    error,
    create,
    join,
    leave,
    resyncView,
    publishView,
    registerViewApplier,
    publishMapPresence,
    subscribeMapPresence,
    presenceSurfaceParticipants,
    viewportPresences,
    viewboxSettings,
    setViewboxSettings,
  }), [canEditSharedView, code, create, error, inviteURL, join, leave, participantCount, presenceSurfaceParticipants, publishMapPresence, publishView, registerViewApplier, resyncView, role, setViewboxSettings, status, subscribeMapPresence, viewboxSettings, viewportPresences, viewSynchronized]);

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
      {Object.values(remotePointers).map((pointer) => (
        <RemoteCursor
          key={pointer.participantId}
          pointer={pointer}
          layoutVersion={cursorLayoutVersion}
          mode={viewboxSettings.cursorPositionMode ?? "proportional"}
        />
      ))}
    </LiveSessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveSession(): LiveSessionContextValue {
  const context = useContext(LiveSessionContext);
  if (!context) throw new Error("useLiveSession must be used within LiveSessionProvider");
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveSessionOptional(): LiveSessionContextValue | null {
  return useContext(LiveSessionContext);
}

export function LivePanelViewboxes({ panelId }: { panelId: string }) {
  const context = useLiveSessionOptional();
  if (!context || context.status !== "live") return null;
  const { showViewboxes, showLabels, showCommonArea } = context.viewboxSettings;
  if (!showViewboxes && !showCommonArea) return null;

  const boxes = Object.entries(context.viewportPresences)
    .map(([participantId, viewport]) => ({ participantId, dimensions: viewport.panels[panelId] }))
    .filter((entry): entry is { participantId: string; dimensions: { width: number; height: number } } => Boolean(entry.dimensions));
  if (boxes.length === 0) return null;
  const commonWidth = Math.min(...boxes.map((entry) => entry.dimensions.width));
  const commonHeight = Math.min(...boxes.map((entry) => entry.dimensions.height));

  return (
    <div className="pointer-events-none absolute inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {showCommonArea && (
        <div
          className="absolute left-1/2 top-1/2 border border-dashed border-white/40 bg-white/[0.035]"
          style={{
            width: `min(100%, ${commonWidth}px)`,
            height: `min(100%, ${commonHeight}px)`,
            transform: "translate(-50%, -50%)",
          }}
        />
      )}
      {showViewboxes && boxes.map(({ participantId, dimensions }) => {
        const color = participantColor(participantId);
        return (
          <div
            key={participantId}
            className="absolute left-1/2 top-1/2 border border-dashed"
            style={{
              width: `min(100%, ${dimensions.width}px)`,
              height: `min(100%, ${dimensions.height}px)`,
              transform: "translate(-50%, -50%)",
              borderColor: color,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 20%, transparent)`,
            }}
          >
            {showLabels && (
              <span
                className="absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] font-medium text-black shadow"
                style={{ backgroundColor: color }}
              >
                {participantLabel(participantId)} · {Math.round(dimensions.width)}×{Math.round(dimensions.height)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const NO_SURFACE_PARTICIPANTS: readonly string[] = [];

// eslint-disable-next-line react-refresh/only-export-components
export function useLivePresenceSurface(surface: string): readonly string[] {
  const context = useLiveSessionOptional();
  return context?.presenceSurfaceParticipants[surface] ?? NO_SURFACE_PARTICIPANTS;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAutoJoinLiveSession(instanceId: string, enabled = true): void {
  const session = useLiveSession();
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get(LIVE_SESSION_QUERY_PARAM);
  const attemptedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !roomCode || session.status !== "idle" || attemptedCodeRef.current === roomCode) return;
    attemptedCodeRef.current = roomCode;
    void session.join(roomCode, instanceId).catch(() => undefined);
  }, [enabled, instanceId, roomCode, session]);
}
