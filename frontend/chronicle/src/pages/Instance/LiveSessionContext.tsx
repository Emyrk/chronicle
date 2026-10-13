import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import type { CreateLiveSessionResponse, JoinLiveSessionResponse } from "@/api/typesGenerated";
import { useSyncModeContext } from "./SyncModeContext";
import {
  LIVE_SESSION_QUERY_PARAM,
  liveSessionInviteURL,
  shouldPublishParticipantReplay,
  websocketURL,
  type LiveReplayState,
  type LiveSessionDataMessage,
  type LiveSessionServerMessage,
  type LiveSessionSignalPayload,
} from "./liveSessionProtocol";

const liveSessionLeaderID = "leader";
const MAX_SIGNAL_BYTES = 64 * 1024;
const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type LiveSessionRole = "leader" | "participant";
export type LiveSessionStatus = "idle" | "connecting" | "live" | "needs_password" | "ended" | "error";

interface RemotePointer {
  participantId: string;
  surfaceId?: string;
  x: number;
  y: number;
}

interface LiveSessionContextValue {
  status: LiveSessionStatus;
  role: LiveSessionRole | null;
  code: string | null;
  inviteURL: string | null;
  participantCount: number;
  error: string | null;
  create: (instanceId: string, password?: string) => Promise<string>;
  join: (code: string, instanceId: string, password?: string) => Promise<void>;
  leave: () => void;
  publishView: (view: unknown) => void;
  registerViewApplier: (apply: ((view: unknown) => void) | null) => void;
}

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

function pointerScreenPosition(pointer: RemotePointer): { x: number; y: number } {
  const surface = liveCursorSurface(pointer.surfaceId);
  if (!surface) {
    return { x: pointer.x * window.innerWidth, y: pointer.y * window.innerHeight };
  }
  const rect = surface.getBoundingClientRect();
  return { x: rect.left + pointer.x * rect.width, y: rect.top + pointer.y * rect.height };
}

function pointerColor(participantId: string): string {
  let hash = 0;
  for (const char of participantId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 80% 60%)`;
}

function RemoteCursor({ pointer, layoutVersion }: { pointer: RemotePointer; layoutVersion: number }) {
  const position = pointerScreenPosition(pointer);
  return (
    <div
      data-cursor-layout-version={layoutVersion}
      className="pointer-events-none fixed left-0 top-0 z-[300] transition-transform duration-100"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div
        className="h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-tl-full rounded-tr-full rounded-bl-full shadow-lg"
        style={{ backgroundColor: pointerColor(pointer.participantId) }}
      />
      <span
        className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium text-black shadow"
        style={{ backgroundColor: pointerColor(pointer.participantId) }}
      >
        {pointer.participantId === "leader" ? "Leader" : pointer.participantId.slice(0, 6)}
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
    enable: enableReplay,
    disable: disableReplay,
    setTimestamp: setReplayTimestamp,
    play: playReplay,
    pause: pauseReplay,
    setPlaybackSpeed: setReplaySpeed,
  } = useSyncModeContext();
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [role, setRole] = useState<LiveSessionRole | null>(null);
  const [code, setCode] = useState<string | null>(requestedCode);
  const [inviteURL, setInviteURL] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [remotePointers, setRemotePointers] = useState<Record<string, RemotePointer>>({});
  const [cursorLayoutVersion, setCursorLayoutVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const channelsRef = useRef(new Map<string, RTCDataChannel>());
  const participantPeerRef = useRef<RTCPeerConnection | null>(null);
  const participantChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const closingSocketRef = useRef(false);
  const currentRoleRef = useRef<LiveSessionRole | null>(null);
  const currentViewRef = useRef<unknown>(null);
  const applyViewRef = useRef<((view: unknown) => void) | null>(null);
  const remoteViewJSONRef = useRef<string | null>(null);
  const previousReplayRef = useRef<LiveReplayState | null>(null);
  const remoteReplayJSONRef = useRef<string | null>(null);

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

  const applyRemoteReplay = useCallback((next: LiveReplayState) => {
    remoteReplayJSONRef.current = JSON.stringify(next);
    if (!next.enabled) {
      disableReplay();
      return;
    }
    enableReplay();
    setReplaySpeed(next.playbackSpeed);
    setReplayTimestamp(next.timestampMs === null ? null : new Date(next.timestampMs));
    if (next.isPlaying) playReplay();
    else pauseReplay();
  }, [disableReplay, enableReplay, pauseReplay, playReplay, setReplaySpeed, setReplayTimestamp]);

  const handleDataMessage = useCallback((raw: string, senderID?: string) => {
    if (raw.length > MAX_SIGNAL_BYTES) return;
    try {
      const message = JSON.parse(raw) as LiveSessionDataMessage;
      if (message.type === "view") {
        currentViewRef.current = message.view;
        remoteViewJSONRef.current = JSON.stringify(message.view);
        applyViewRef.current?.(message.view);
      } else if (message.type === "replay") {
        applyRemoteReplay(message.replay);
      } else if (message.type === "pointer") {
        const participantId = senderID ?? message.participantId;
        if (!participantId || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
        const pointer = {
          participantId,
          ...(typeof message.surfaceId === "string" ? { surfaceId: message.surfaceId } : {}),
          x: Math.max(0, Math.min(1, message.x)),
          y: Math.max(0, Math.min(1, message.y)),
        };
        setRemotePointers((previous) => ({ ...previous, [participantId]: pointer }));
        if (currentRoleRef.current === "leader") {
          sendData({ type: "pointer", ...pointer }, senderID);
        }
        return;
      } else {
        return;
      }
      if (currentRoleRef.current === "leader") sendData(message, senderID);
    } catch {
      // Ignore malformed peer messages in the proof of concept.
    }
  }, [applyRemoteReplay, sendData]);

  const configureChannel = useCallback((channel: RTCDataChannel, participantID?: string) => {
    channel.onopen = () => {
      setStatus("live");
      if (currentRoleRef.current === "leader") {
        if (currentViewRef.current) channel.send(JSON.stringify({ type: "view", view: currentViewRef.current } satisfies LiveSessionDataMessage));
        channel.send(JSON.stringify({ type: "replay", replay: replayStateRef.current } satisfies LiveSessionDataMessage));
      }
    };
    channel.onmessage = (event) => {
      if (typeof event.data === "string") handleDataMessage(event.data, participantID);
    };
    channel.onclose = () => {
      if (currentRoleRef.current === "participant") {
        pauseReplay();
        setStatus("ended");
      }
    };
  }, [handleDataMessage, pauseReplay]);

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
    setParticipantCount(0);
    setRemotePointers({});
  }, []);

  const connectSocket = useCallback((roomCode: string, token: string, nextRole: LiveSessionRole) => {
    closeTransport();
    closingSocketRef.current = false;
    currentRoleRef.current = nextRole;
    setRole(nextRole);
    setCode(roomCode);
    setStatus("connecting");
    setError(null);

    const socket = new WebSocket(websocketURL(
      `/api/v1/live-sessions/${encodeURIComponent(roomCode)}/ws?token=${encodeURIComponent(token)}`,
      window.location,
    ));
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
        setRemotePointers((previous) => {
          const next = { ...previous };
          delete next[message.participant_id];
          return next;
        });
        setParticipantCount((count) => Math.max(0, count - 1));
      } else if (message.type === "session_ended") {
        pauseReplay();
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
      pauseReplay();
      closeTransport();
      setStatus(nextRole === "participant" ? "ended" : "error");
      if (nextRole === "leader") setError("The live signaling connection closed");
    };
    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      setError("Could not connect to the live session");
      setStatus("error");
    };
  }, [closeTransport, createLeaderPeer, ensureParticipantPeer, pauseReplay, sendSignal, setSearchParams]);

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
    connectSocket(created.code, created.leader_token, "leader");
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
    connectSocket(roomCode, joined.participant_token, "participant");
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
    if (status === "live") sendData({ type: "view", view });
  }, [sendData, status]);

  const registerViewApplier = useCallback((apply: ((view: unknown) => void) | null) => {
    applyViewRef.current = apply;
  }, []);

  useEffect(() => {
    const encoded = JSON.stringify(replayState);
    if (remoteReplayJSONRef.current === encoded) {
      remoteReplayJSONRef.current = null;
      previousReplayRef.current = replayState;
      return;
    }
    if (status === "live") {
      const shouldPublish = role === "leader"
        || shouldPublishParticipantReplay(previousReplayRef.current, replayState);
      if (shouldPublish) sendData({ type: "replay", replay: replayState });
    }
    previousReplayRef.current = replayState;
  }, [replayState, role, sendData, status]);

  useEffect(() => () => closeTransport(), [closeTransport]);

  useEffect(() => {
    if (status !== "live") return;
    let lastSentAt = 0;
    const handlePointerMove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - lastSentAt < 100) return;
      lastSentAt = now;
      const eventTarget = event.target instanceof Element ? event.target : null;
      const surface = eventTarget?.closest<HTMLElement>("[data-live-cursor-surface]")
        ?? document.querySelector<HTMLElement>("[data-live-cursor-surface=instance]");
      const rect = surface?.getBoundingClientRect();
      const pointer = {
        type: "pointer" as const,
        ...(role === "leader" ? { participantId: "leader" } : {}),
        ...(surface?.dataset.liveCursorSurface ? { surfaceId: surface.dataset.liveCursorSurface } : {}),
        x: rect ? (event.clientX - rect.left) / Math.max(1, rect.width) : event.clientX / Math.max(1, window.innerWidth),
        y: rect ? (event.clientY - rect.top) / Math.max(1, rect.height) : event.clientY / Math.max(1, window.innerHeight),
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
    error,
    create,
    join,
    leave,
    publishView,
    registerViewApplier,
  }), [code, create, error, inviteURL, join, leave, participantCount, publishView, registerViewApplier, role, status]);

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
      {Object.values(remotePointers).map((pointer) => (
        <RemoteCursor key={pointer.participantId} pointer={pointer} layoutVersion={cursorLayoutVersion} />
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
export function useAutoJoinLiveSession(instanceId: string): void {
  const session = useLiveSession();
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get(LIVE_SESSION_QUERY_PARAM);
  const attemptedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomCode || session.status !== "idle" || attemptedCodeRef.current === roomCode) return;
    attemptedCodeRef.current = roomCode;
    void session.join(roomCode, instanceId).catch(() => undefined);
  }, [instanceId, roomCode, session]);
}
