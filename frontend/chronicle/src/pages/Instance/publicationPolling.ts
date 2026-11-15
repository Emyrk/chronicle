import { useMemo, useSyncExternalStore } from "react";

export const PUBLICATION_IDLE_INTERVAL_MS = 30_000;
export const PUBLICATION_PENDING_INTERVAL_MS = 5_000;
export const PUBLICATION_FAST_WINDOW_MS = 60_000;

interface PublicationMetadata { id: string; publication_pending?: boolean }

/** A finite fast window per resolved instance/pending transition, not a new revision. */
export function createPublicationPollingPolicy(now: () => number = Date.now) {
  let pendingId: string | undefined;
  let pendingSince = 0;
  return (data?: PublicationMetadata): number => {
    if (!data?.publication_pending) {
      pendingId = undefined;
      return PUBLICATION_IDLE_INTERVAL_MS;
    }
    if (pendingId !== data.id) {
      pendingId = data.id;
      pendingSince = now();
    }
    return now() - pendingSince < PUBLICATION_FAST_WINDOW_MS
      ? PUBLICATION_PENDING_INTERVAL_MS
      : PUBLICATION_IDLE_INTERVAL_MS;
  };
}

export function isPublicationPageActive(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
}

export function subscribePublicationActivity(listener: () => void): () => void {
  window.addEventListener("focus", listener);
  window.addEventListener("blur", listener);
  document.addEventListener("visibilitychange", listener);
  return () => {
    window.removeEventListener("focus", listener);
    window.removeEventListener("blur", listener);
    document.removeEventListener("visibilitychange", listener);
  };
}

/** Only public instance metadata is polled; private parent-log access is not needed. */
export function usePublicationPolling(route: string) {
  const active = useSyncExternalStore(subscribePublicationActivity, isPublicationPageActive, () => false);
  const interval = useMemo(() => route ? createPublicationPollingPolicy() : () => PUBLICATION_IDLE_INTERVAL_MS, [route]);
  return {
    enabled: !!route && active,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query: { state: { data?: PublicationMetadata; error: unknown } }) => active && !query.state.error ? interval(query.state.data) : false as const,
  };
}
