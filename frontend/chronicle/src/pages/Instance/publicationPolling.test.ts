import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicationPollingPolicy, isPublicationPageActive, subscribePublicationActivity, usePublicationPolling } from "./publicationPolling";

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));

afterEach(() => vi.unstubAllGlobals());

describe("public instance publication polling", () => {
  it("disables query timers when inactive, on errors or without a route and never polls in background", () => {
    let focused = false;
    vi.stubGlobal("document", { visibilityState: "visible", hasFocus: () => focused });
    const inactive = usePublicationPolling("stable-slug");
    expect(inactive.enabled).toBe(false);
    expect(inactive.refetchInterval({ state: { data: { id: "old", publication_pending: true }, error: null } })).toBe(false);
    focused = true;
    const active = usePublicationPolling("stable-slug");
    expect(active.enabled).toBe(true);
    expect(active.refetchIntervalInBackground).toBe(false);
    expect(active.refetchOnWindowFocus).toBe(true);
    expect(active.refetchInterval({ state: { data: { id: "new", publication_pending: false }, error: null } })).toBe(30000);
    expect(active.refetchInterval({ state: { error: new Error("denied") } })).toBe(false);
    expect(usePublicationPolling("").enabled).toBe(false);
  });

  it("uses30s discovery without requiring private log-group data,5s during pending, then30s after replacement", () => {
    const interval = createPublicationPollingPolicy(() => 0);
    expect(interval({ id: "old" })).toBe(30000);
    expect(interval({ id: "old", publication_pending: true })).toBe(5000);
    expect(interval({ id: "replacement", publication_pending: false })).toBe(30000);
  });

  it("limits fast polling to60seconds even when callbacks run repeatedly", () => {
    let now = 1000;
    const interval = createPublicationPollingPolicy(() => now);
    const pending = { id: "old", publication_pending: true };
    expect(interval(pending)).toBe(5000);
    for (let i = 0; i < 50; i++) expect(interval(pending)).toBe(5000);
    now = 60999;
    expect(interval(pending)).toBe(5000);
    now = 61000;
    expect(interval(pending)).toBe(30000);
    now = 1000000;
    expect(interval(pending)).toBe(30000);
  });

  it("allows a new bounded fast window after a genuinely new pending transition or replacement ID", () => {
    let now = 0;
    const interval = createPublicationPollingPolicy(() => now);
    interval({ id: "a", publication_pending: true });
    now = 60000;
    expect(interval({ id: "a", publication_pending: true })).toBe(30000);
    interval({ id: "a", publication_pending: false });
    expect(interval({ id: "a", publication_pending: true })).toBe(5000);
    now = 120000;
    expect(interval({ id: "b", publication_pending: true })).toBe(5000);
  });

  it("stops activity while hidden or window-blurred and removes all listeners on unmount", () => {
    const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => focused });
    const windowTarget = new EventTarget();
    let focused = true;
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);
    const activity: boolean[] = [];
    const unsubscribe = subscribePublicationActivity(() => activity.push(isPublicationPageActive()));
    expect(isPublicationPageActive()).toBe(true);
    focused = false;
    windowTarget.dispatchEvent(new Event("blur"));
    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    focused = true;
    windowTarget.dispatchEvent(new Event("focus"));
    documentTarget.visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(activity).toEqual([false, false, false, true]);
    unsubscribe();
    windowTarget.dispatchEvent(new Event("focus"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(activity).toHaveLength(4);
  });
});
