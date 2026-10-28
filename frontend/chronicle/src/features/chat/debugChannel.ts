import { useEffect, useRef, useState } from "react";
import { emptyDebugBundle, mergeDebugBundle, type DebugBundle } from "./debugViewerModel";

// The chat tab and the pop-out debug viewer talk over a same-origin BroadcastChannel. Nothing leaves
// the browser: the viewer only sees what the chat tab already received from the server.

const CHANNEL_PREFIX = "chronicle-assistant-debug:";

export interface DebugChannelState { bundle: DebugBundle; title?: string }

export type DebugChannelMessage =
  | { type: "hello" }
  | ({ type: "state" } & DebugChannelState)
  | { type: "bye" };

export type DebugLinkStatus = "waiting" | "connected" | "disconnected";

export const newDebugChannelId = () => crypto.randomUUID();

export const debugViewerPath = (channelId: string) => `/debug/assistant?channel=${encodeURIComponent(channelId)}`;

export function openDebugViewer(channelId: string): void {
  window.open(debugViewerPath(channelId), `chronicle-debug-${channelId}`, "popup,width=1320,height=880");
}

/** Chat side: publishes state and answers viewers that join later. Returns a publish function and a close function. */
export function openDebugPublisher(channelId: string, initial: DebugChannelState) {
  let latest = initial;
  const channel = new BroadcastChannel(CHANNEL_PREFIX + channelId);
  const post = () => channel.postMessage({ type: "state", ...latest } satisfies DebugChannelMessage);
  channel.onmessage = (event: MessageEvent<DebugChannelMessage>) => {
    if (event.data?.type === "hello") post();
  };
  return {
    publish(state: DebugChannelState) { latest = state; post(); },
    bye() { channel.postMessage({ type: "bye" } satisfies DebugChannelMessage); },
    close() { channel.postMessage({ type: "bye" } satisfies DebugChannelMessage); channel.close(); },
  };
}

/** Viewer side: asks for the current state and reports every state or goodbye the chat sends. */
export function subscribeDebugChannel(channelId: string, onMessage: (message: Exclude<DebugChannelMessage, { type: "hello" }>) => void) {
  const channel = new BroadcastChannel(CHANNEL_PREFIX + channelId);
  channel.onmessage = (event: MessageEvent<DebugChannelMessage>) => {
    if (event.data?.type === "state" || event.data?.type === "bye") onMessage(event.data);
  };
  channel.postMessage({ type: "hello" } satisfies DebugChannelMessage);
  return () => channel.close();
}

/** Chat side hook: publishes the current debug state while mounted. */
export function useDebugBroadcast(channelId: string, bundle: DebugBundle, title?: string): void {
  const latest = useRef<DebugChannelState>({ bundle, title });
  const publisher = useRef<ReturnType<typeof openDebugPublisher> | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const opened = openDebugPublisher(channelId, latest.current);
    publisher.current = opened;
    const bye = () => opened.bye();
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      opened.close();
      publisher.current = null;
    };
  }, [channelId]);
  useEffect(() => {
    latest.current = { bundle, title };
    publisher.current?.publish(latest.current);
  }, [bundle, title]);
}

/**
 * Viewer side hook: collects every run the chat publishes. The chat resets its snapshots per run, so
 * the viewer merges instead of replacing and keeps the history after the chat tab closes.
 */
export function useDebugSubscription(channelId: string | null) {
  const [bundle, setBundle] = useState<DebugBundle>(emptyDebugBundle);
  const [title, setTitle] = useState<string>();
  const [status, setStatus] = useState<DebugLinkStatus>("waiting");
  useEffect(() => {
    if (!channelId || typeof BroadcastChannel === "undefined") return;
    return subscribeDebugChannel(channelId, (message) => {
      if (message.type === "bye") return setStatus("disconnected");
      setStatus("connected");
      setTitle(message.title);
      setBundle((current) => mergeDebugBundle(current, message.bundle));
    });
  }, [channelId]);
  return { bundle, setBundle, title, status };
}
