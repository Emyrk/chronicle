import { describe, expect, it } from "vitest";
import { DEFAULT_INSTANCE_PANEL_OPTIONS, defaultInstanceLayout } from "./viewDefaults";
import {
  DEFAULT_PRESET_ID,
  getAvailablePresetLayouts,
  isPanelPresetLayout,
  PRESET_LAYOUTS,
  PRESET_LAYOUTS_BY_ID,
  presetLayoutById,
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
  it("follows Player Timeline and stacks the map on the replay strip seamlessly", () => {
    const ids = PRESET_LAYOUTS.map((preset) => preset.id);
    expect(ids.indexOf("map")).toBe(ids.indexOf("player_timeline") + 1);
    const preset = PRESET_LAYOUTS_BY_ID.map;
    if (!isPanelPresetLayout(preset)) throw new Error("Map should be a panels preset");
    expect(preset.seamless).toBe(true);
    const [map, strip] = preset.layoutItems;
    expect(preset.panelTypes[map.id]).toBe("map");
    expect(strip).toMatchObject({ kind: "strip", stripType: "replay", y: map.y + map.h, w: map.w });
  });

  it("needs unit positions", () => {
    expect(getAvailablePresetLayouts([]).map((preset) => preset.id)).not.toContain("map");
    expect(getAvailablePresetLayouts(["unit-position"]).map((preset) => preset.id)).toContain("map");
  });
});

describe("Summary mini map", () => {
  function panelsPreset(capabilities: string[]) {
    const preset = presetLayoutById("summary", capabilities);
    if (!preset || !isPanelPresetLayout(preset)) throw new Error("Summary should be a panels preset");
    return preset;
  }

  it("puts a Mini Map panel beside the timeline for logs with positions", () => {
    const summary = panelsPreset(["unit-position"]);
    const mapId = Object.entries(summary.panelTypes).find(([, type]) => type === "mini_map")?.[0];
    expect(mapId).toBeDefined();
    expect(summary.layoutItems.find((item) => item.id === mapId)).toMatchObject({ x: 8, y: 0, w: 4 });
    // The timeline shares the top row and keeps its options.
    expect(summary.layoutItems.find((item) => item.id === "panel-1")).toMatchObject({ x: 0, y: 0, w: 8 });
    expect(summary.panelOptions["panel-1"]).toBe(panelsPreset([]).panelOptions["panel-1"]);
  });

  it("leaves Summary unchanged on mobile", () => {
    const summary = presetLayoutById("summary", ["unit-position"], true);
    expect(summary).toBe(PRESET_LAYOUTS_BY_ID.summary);
    const mobile = defaultInstanceLayout(["unit-position"], true);
    expect(mobile.items.some((item) => mobile.panelTypes[item.id] === "mini_map")).toBe(false);
    // The Map tab itself stays available on mobile.
    expect(getAvailablePresetLayouts(["unit-position"], true).map((preset) => preset.id)).toContain("map");
  });

  it("leaves Summary unchanged for logs without positions", () => {
    expect(Object.values(panelsPreset([]).panelTypes)).not.toContain("mini_map");
    expect(getAvailablePresetLayouts([]).find((preset) => preset.id === "summary")).toBe(PRESET_LAYOUTS_BY_ID.summary);
  });

  it("is the built-in default layout for logs with positions", () => {
    const withPositions = defaultInstanceLayout(["unit-position"]);
    expect(withPositions.items.some((item) => withPositions.panelTypes[item.id] === "mini_map")).toBe(true);

    const without = defaultInstanceLayout([]);
    expect(without.items.some((item) => without.panelTypes[item.id] === "mini_map")).toBe(false);
  });
});
