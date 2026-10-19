import { describe, expect, it } from "vitest";
import {
  canPublishLiveView,
  cursorScreenPosition,
  cursorSurfaceOffset,
  liveSessionInviteURL,
  liveSnapshotMatchesRequest,
  parseLivePresenceSurface,
  parseMapPresence,
  parseViewportPresence,
  participantColor,
  participantLabel,
  receiveLiveView,
  setLiveViewApplier,
  shouldPublishParticipantReplay,
  websocketURL,
  type LiveReplayState,
  type LiveViewDelivery,
} from "./liveSessionProtocol";

const paused = (timestampMs: number): LiveReplayState => ({
  enabled: true,
  timestampMs,
  isPlaying: false,
  playbackSpeed: 1,
});

describe("liveSessionInviteURL", () => {
  it("preserves the instance URL and replaces imported snapshot state", () => {
    expect(liveSessionInviteURL(
      "https://example.test/instances/raid?view=overview&import=old",
      "room123",
    )).toBe("https://example.test/instances/raid?view=overview&live=room123");
  });
});

describe("websocketURL", () => {
  it("uses secure websockets on HTTPS", () => {
    expect(websocketURL("/api/v1/live", { protocol: "https:", host: "example.test" } as Location))
      .toBe("wss://example.test/api/v1/live");
  });

  it("uses plain websockets for local HTTP development", () => {
    expect(websocketURL("/api/v1/live", { protocol: "http:", host: "localhost:4000" } as Location))
      .toBe("ws://localhost:4000/api/v1/live");
  });
});

describe("participantLabel", () => {
  it("shows authenticated usernames and shortens anonymous IDs", () => {
    expect(participantLabel("leader")).toBe("Leader");
    expect(participantLabel("user:Emyrk")).toBe("Emyrk");
    expect(participantLabel("user:Emyrk-2")).toBe("Emyrk-2");
    expect(participantLabel("AbCdEfGhIjKl")).toBe("AbCdEf");
  });
});

describe("shared cursor coordinates", () => {
  it("preserves the pixel offset when the receiving surface is taller", () => {
    const offset = cursorSurfaceOffset(250, 550, {
      left: 50,
      top: 100,
      width: 400,
      height: 500,
    });

    expect(offset).toEqual({ x: 200, y: 450 });
    expect(cursorScreenPosition(offset.x, offset.y, {
      left: 20,
      top: 30,
      width: 800,
      height: 1000,
    })).toEqual({ x: 220, y: 480 });
  });

  it("clamps offsets that exceed a smaller receiving surface", () => {
    expect(cursorScreenPosition(700, 900, {
      left: 20,
      top: 30,
      width: 600,
      height: 700,
    })).toEqual({ x: 620, y: 730 });
  });
});

describe("canPublishLiveView", () => {
  it("lets the leader publish immediately", () => {
    expect(canPublishLiveView("leader", false)).toBe(true);
  });

  it("waits for the leader's initial view before a participant publishes", () => {
    expect(canPublishLiveView("participant", false)).toBe(false);
    expect(canPublishLiveView("participant", true)).toBe(true);
  });
});

describe("live view delivery", () => {
  it("applies a view buffered before the page registers its applier", () => {
    const delivery: LiveViewDelivery<{ page: string }> = { applier: null, pending: null };
    const applied: Array<{ page: string }> = [];
    let acknowledged = false;

    receiveLiveView(delivery, { page: "timeline" }, () => { acknowledged = true; });
    expect(applied).toEqual([]);
    expect(acknowledged).toBe(false);

    setLiveViewApplier(delivery, (view) => applied.push(view));
    expect(applied).toEqual([{ page: "timeline" }]);
    expect(acknowledged).toBe(true);
    expect(delivery.pending).toBeNull();
  });

  it("delivers subsequent views immediately without replaying the buffered view", () => {
    const delivery: LiveViewDelivery<number> = { applier: null, pending: null };
    const applied: number[] = [];

    receiveLiveView(delivery, 1);
    setLiveViewApplier(delivery, (view) => applied.push(view));
    receiveLiveView(delivery, 2);
    setLiveViewApplier(delivery, null);
    setLiveViewApplier(delivery, (view) => applied.push(view));

    expect(applied).toEqual([1, 2]);
  });
});

describe("live snapshot requests", () => {
  it("accepts only the response correlated to the pending request", () => {
    expect(liveSnapshotMatchesRequest("request-1", "request-1")).toBe(true);
  });

  it("rejects stale, unsolicited, and uncorrelated snapshots", () => {
    expect(liveSnapshotMatchesRequest("request-2", "request-1")).toBe(false);
    expect(liveSnapshotMatchesRequest("request-1", undefined)).toBe(false);
    expect(liveSnapshotMatchesRequest(null, "request-1")).toBe(false);
    expect(liveSnapshotMatchesRequest(null, undefined)).toBe(false);
  });
});

describe("shouldPublishParticipantReplay", () => {
  it("publishes paused seeks and transport changes", () => {
    expect(shouldPublishParticipantReplay(paused(1000), paused(2000))).toBe(true);
    expect(shouldPublishParticipantReplay(paused(1000), { ...paused(1000), isPlaying: true })).toBe(true);
    expect(shouldPublishParticipantReplay(paused(1000), { ...paused(1000), playbackSpeed: 2 })).toBe(true);
  });

  it("does not echo locally advancing timestamps while following playback", () => {
    const playing = { ...paused(1000), isPlaying: true };
    expect(shouldPublishParticipantReplay(playing, { ...playing, timestampMs: 1100 })).toBe(false);
  });
});

describe("parseLivePresenceSurface", () => {
  it("accepts stable panel presence surface identifiers", () => {
    expect(parseLivePresenceSurface("map")).toBe("map");
    expect(parseLivePresenceSurface("panel:rotation-timeline_2")).toBe("panel:rotation-timeline_2");
  });

  it("rejects malformed or oversized identifiers", () => {
    expect(parseLivePresenceSurface("")).toBeUndefined();
    expect(parseLivePresenceSurface("Map View")).toBeUndefined();
    expect(parseLivePresenceSurface("a".repeat(65))).toBeUndefined();
    expect(parseLivePresenceSurface(null)).toBeUndefined();
  });
});

describe("parseViewportPresence", () => {
  it("accepts finite window and panel dimensions", () => {
    expect(parseViewportPresence({
      window: { width: 1440, height: 900 },
      panels: { "panel-1": { width: 640, height: 420 } },
    })).toEqual({
      window: { width: 1440, height: 900 },
      panels: { "panel-1": { width: 640, height: 420 } },
    });
  });

  it("rejects invalid windows and drops malformed panels", () => {
    expect(parseViewportPresence({ window: { width: 0, height: 900 }, panels: {} })).toBeNull();
    expect(parseViewportPresence({
      window: { width: 800, height: 600 },
      panels: {
        "panel-1": { width: Number.NaN, height: 300 },
        "bad panel": { width: 200, height: 200 },
      },
    })).toEqual({ window: { width: 800, height: 600 }, panels: {} });
  });
});

describe("parseMapPresence", () => {
  const presence = { ground: "https://maps/zg.glb", mode: "walk", position: [1, 2, 3], target: [1, 2, 2] };

  it("accepts a camera or a walking character", () => {
    expect(parseMapPresence(presence)).toEqual(presence);
    expect(parseMapPresence({ ...presence, mode: "camera" })?.mode).toBe("camera");
  });

  it("rejects malformed presences", () => {
    expect(parseMapPresence(null)).toBeNull();
    expect(parseMapPresence({ ...presence, mode: "fly" })).toBeNull();
    expect(parseMapPresence({ ...presence, ground: "" })).toBeNull();
    expect(parseMapPresence({ ...presence, position: [1, 2] })).toBeNull();
    expect(parseMapPresence({ ...presence, target: [1, Number.NaN, 2] })).toBeNull();
    expect(parseMapPresence({ ...presence, position: ["1", 2, 3] })).toBeNull();
  });

  it("colours a participant the same every time", () => {
    expect(participantColor("abc123")).toBe(participantColor("abc123"));
    expect(participantColor("leader")).toMatch(/^hsl\(\d+ 80% 60%\)$/);
  });
});
