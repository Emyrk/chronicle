import { describe, expect, it } from "vitest";
import { DEFAULT_INSTANCE_PANEL_OPTIONS } from "./viewDefaults";
import { PRESET_LAYOUTS } from "./presetLayouts";
import {
  deserializeTimelineConfig,
  extractTimelineToken,
} from "./EventsPanels/Timeline/timelineTypes";

function timelineBackground(panelOption: string | undefined): string | undefined {
  return deserializeTimelineConfig(extractTimelineToken(panelOption))?.settings.background;
}

describe("built-in Timeline backgrounds", () => {
  it("enables Raid Durability for the default Summary layout", () => {
    expect(timelineBackground(DEFAULT_INSTANCE_PANEL_OPTIONS["panel-1"])).toBe("raid_durability");
  });

  it("enables Raid Durability for every preset tab containing a line chart", () => {
    const timelinePresets = PRESET_LAYOUTS.filter((preset) =>
      Object.values(preset.panelTypes).includes("timeline"),
    );

    expect(timelinePresets.map((preset) => preset.label)).toEqual(["Summary", "Damage", "Healing"]);
    for (const preset of timelinePresets) {
      const timelinePanelId = Object.entries(preset.panelTypes).find(([, type]) => type === "timeline")?.[0];
      expect(timelineBackground(timelinePanelId ? preset.panelOptions[timelinePanelId] : undefined)).toBe(
        "raid_durability",
      );
    }
  });
});
