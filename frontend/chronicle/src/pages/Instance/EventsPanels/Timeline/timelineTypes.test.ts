import { describe, expect, it } from "vitest";
import {
  FALLBACK_SERIES_CONFIG,
  deserializeTimelineConfig,
  getDefaultSettings,
  getTimelineSettings,
  serializeTimelineConfig,
} from "./timelineTypes";

describe("Timeline settings", () => {
  it("defaults new line charts to no background", () => {
    expect(getDefaultSettings()).toEqual({ binMs: 1000, background: "none" });
    expect(getTimelineSettings(null).background).toBe("none");
  });

  it("treats older saved configs without a background as None", () => {
    expect(getTimelineSettings({ timelineSettings: { binMs: 500 } })).toEqual({
      binMs: 500,
      background: "none",
    });
  });

  it("round-trips Raid Durability through panel option persistence", () => {
    const encoded = serializeTimelineConfig(FALLBACK_SERIES_CONFIG, {
      binMs: 500,
      background: "raid_durability",
    });

    expect(deserializeTimelineConfig(encoded)?.settings.background).toBe("raid_durability");
  });
});
