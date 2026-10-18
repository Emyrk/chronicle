import { describe, expect, it } from "vitest";
import {
  cursorScreenPosition,
  cursorSurfaceOffset,
  liveSessionInviteURL,
  parseLivePresenceSurface,
  parseMapPresence,
  participantColor,
  shouldPublishParticipantReplay,
  websocketURL,
  type LiveReplayState,
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
