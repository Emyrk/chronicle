import { describe, expect, it } from "vitest";
import {
  FALLBACK_SERIES_CONFIG,
  deserializeTimelineConfig,
  getDefaultSettings,
  getTimelineSettings,
  serializeTimelineConfig,
} from "./timelineTypes";

describe("Timeline settings", () => {
  it("defaults new line charts to no background or annotations", () => {
    expect(getDefaultSettings()).toEqual({ binMs: 1000, background: "none", annotations: [] });
    expect(getTimelineSettings(null).background).toBe("none");
  });

  it("fills defaults for older saved configs", () => {
    expect(getTimelineSettings({ timelineSettings: { binMs: 500 } })).toEqual({
      binMs: 500,
      background: "none",
      annotations: [],
    });
  });

  it("ignores unknown saved annotation values", () => {
    expect(getTimelineSettings({
      timelineSettings: {
        binMs: 1000,
        annotations: ["phases", "unknown", "player_deaths"],
      },
    }).annotations).toEqual(["phases", "player_deaths"]);
  });

  it("round-trips chart settings through panel option persistence", () => {
    const encoded = serializeTimelineConfig(FALLBACK_SERIES_CONFIG, {
      binMs: 500,
      background: "raid_durability",
      annotations: ["phases", "player_deaths"],
    });

    expect(deserializeTimelineConfig(encoded)?.settings).toEqual({
      binMs: 500,
      background: "raid_durability",
      annotations: ["phases", "player_deaths"],
    });
  });
});
