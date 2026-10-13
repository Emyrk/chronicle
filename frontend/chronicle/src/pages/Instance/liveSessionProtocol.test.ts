import { describe, expect, it } from "vitest";
import {
  liveSessionInviteURL,
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
