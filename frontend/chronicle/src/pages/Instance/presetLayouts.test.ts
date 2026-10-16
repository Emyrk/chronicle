import { describe, expect, it } from "vitest";
import { DEFAULT_INSTANCE_PANEL_OPTIONS } from "./viewDefaults";
import {
  DEFAULT_PRESET_ID,
  getAvailablePresetLayouts,
  isPanelPresetLayout,
  PRESET_LAYOUTS,
  PRESET_LAYOUTS_BY_ID,
  isSeamlessPreset,
} from "./presetLayouts";
import {
  deserializeTimelineConfig,
  extractTimelineToken,
} from "./EventsPanels/Timeline/timelineTypes";

function timelineSettings(panelOption: string | undefined) {
  return deserializeTimelineConfig(extractTimelineToken(panelOption))?.settings;
}

describe("built-in Timeline settings", () => {
  it("enables Raid Durability and player deaths for the default panel grid", () => {
    const settings = timelineSettings(DEFAULT_INSTANCE_PANEL_OPTIONS["panel-1"]);

    expect(settings?.background).toBe("raid_durability");
    expect(settings?.annotations).toEqual(["player_deaths"]);
  });

  it("enables Raid Durability and player deaths for every preset tab containing a line chart", () => {
    const timelinePresets = PRESET_LAYOUTS.filter(isPanelPresetLayout).filter((preset) =>
      Object.values(preset.panelTypes).includes("timeline"),
    );

    expect(timelinePresets.map((preset) => preset.label)).toEqual(["Summary", "Damage", "Healing"]);
    for (const preset of timelinePresets) {
      const timelinePanelId = Object.entries(preset.panelTypes).find(([, type]) => type === "timeline")?.[0];
      const settings = timelineSettings(timelinePanelId ? preset.panelOptions[timelinePanelId] : undefined);

      expect(settings?.background).toBe("raid_durability");
      expect(settings?.annotations).toEqual(["player_deaths"]);
    }
  });
});

describe("default preset layout", () => {
  it("uses the Summary panels", () => {
    expect(PRESET_LAYOUTS_BY_ID[DEFAULT_PRESET_ID]).toMatchObject({
      id: "summary",
      label: "Summary",
      kind: "panels",
    });
  });
});

describe("preset layout availability", () => {
  it("hides the Interrupts quick select when the log does not support interrupts", () => {
    const labels = getAvailablePresetLayouts([]).map((preset) => preset.label);

    expect(labels).not.toContain("Interrupts");
    expect(labels).toContain("Player Timeline");
    expect(labels).toContain("Summary");
  });

  it("shows the Interrupts quick select when the log supports interrupts", () => {
    const labels = getAvailablePresetLayouts(["interrupt"]).map((preset) => preset.label);

    expect(labels).toContain("Interrupts");
  });
});

describe("Map preset", () => {
  it("follows Player Timeline and stacks the map on the replay controller seamlessly", () => {
    const ids = PRESET_LAYOUTS.map((preset) => preset.id);
    expect(ids.indexOf("map")).toBe(ids.indexOf("player_timeline") + 1);
    const preset = PRESET_LAYOUTS_BY_ID.map;
    expect(isSeamlessPreset("map")).toBe(true);
    expect(isSeamlessPreset("summary")).toBe(false);
    expect(isSeamlessPreset(null)).toBe(false);
    if (!isPanelPresetLayout(preset)) throw new Error("Map should be a panels preset");
    const [map, strip] = preset.layoutItems;
    expect(preset.panelTypes[map.id]).toBe("map");
    expect(strip).toMatchObject({ kind: "strip", stripType: "replay_controller", y: map.y + map.h, w: map.w });
  });

  it("needs unit positions", () => {
    expect(getAvailablePresetLayouts([]).map((preset) => preset.id)).not.toContain("map");
    expect(getAvailablePresetLayouts(["unit-position"]).map((preset) => preset.id)).toContain("map");
  });
});
