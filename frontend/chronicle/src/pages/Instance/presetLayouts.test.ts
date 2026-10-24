import { describe, expect, it } from "vitest";
import { DEFAULT_INSTANCE_PANEL_OPTIONS, defaultInstanceLayout } from "./viewDefaults";
import {
  DEFAULT_PRESET_ID,
  getAvailablePresetLayouts,
  isPanelPresetLayout,
  mapPresetRowsForViewport,
  resizeMapPresetForViewport,
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

describe("Player Timeline preset", () => {
  it("uses a seamless panel layout with grouped panels above an intrinsic timeline", () => {
    const preset = PRESET_LAYOUTS_BY_ID.player_timeline;
    if (!isPanelPresetLayout(preset)) throw new Error("Player Timeline should be a panels preset");

    expect(preset.seamless).toBe(true);
    const group = preset.layoutItems.find((item) => item.kind === "group");
    const timelineId = Object.entries(preset.panelTypes).find(([, type]) => type === "player_timeline")?.[0];
    const timeline = preset.layoutItems.find((item) => item.id === timelineId);
    const groupedPanels = preset.layoutItems.filter((item) => item.groupId === group?.id);

    expect(group).toMatchObject({ y: 0, collapsedByDefault: true });
    expect(groupedPanels).toHaveLength(2);
    expect(groupedPanels.every((item) => item.y < (timeline?.y ?? 0))).toBe(true);
    expect(timeline).toMatchObject({ w: 12, h: 1, minH: 1, maxH: 1 });
  });
});

describe("Map preset", () => {
  it("follows Player Timeline and stacks the replay strip above the map seamlessly", () => {
    const ids = PRESET_LAYOUTS.map((preset) => preset.id);
    expect(ids.indexOf("map")).toBe(ids.indexOf("player_timeline") + 1);
    const preset = PRESET_LAYOUTS_BY_ID.map;
    if (!isPanelPresetLayout(preset)) throw new Error("Map should be a panels preset");
    expect(preset.seamless).toBe(true);
    const map = preset.layoutItems.find((item) => item.id === "panel-1");
    const strip = preset.layoutItems.find((item) => item.id === "strip-1");
    if (!map) throw new Error("Map preset should contain the map panel");
    expect(strip).toMatchObject({ kind: "strip", stripType: "replay", y: 0, w: map.w });
    expect(map).toMatchObject({ y: 1 });
    expect(preset.panelTypes[map.id]).toBe("map");
  });

  it("uses a shorter, non-fitted map panel on mobile and keeps desktop fitted", () => {
    const desktop = presetLayoutById("map", ["unit-position"], false);
    const mobile = presetLayoutById("map", ["unit-position"], true);
    if (!desktop || !mobile || !isPanelPresetLayout(desktop) || !isPanelPresetLayout(mobile)) {
      throw new Error("Map should resolve to panel presets");
    }

    expect(desktop.fit).toBe(true);
    expect(desktop.layoutItems.find((item) => item.id === "panel-1")).toMatchObject({ y: 1, h: 9 });
    expect(desktop.layoutItems.find((item) => item.id === "strip-1")).toMatchObject({ y: 0 });
    expect(mobile.fit).toBe(false);
    expect(mobile.layoutItems[0]).toMatchObject({ id: "panel-1", h: 4 });
    expect(mobile.layoutItems[1]).toMatchObject({ id: "strip-1", y: 4 });
  });

  it.each([
    [720, 4],
    [800, 5],
    [900, 6],
    [1080, 7],
    [1300, 8],
    [1600, 9],
  ])("a %ipx-tall viewport uses %i map rows", (viewportHeight, rows) => {
    expect(mapPresetRowsForViewport(viewportHeight)).toBe(rows);
  });

  it("keeps the replay strip above the responsive map", () => {
    const preset = PRESET_LAYOUTS_BY_ID.map;
    if (!isPanelPresetLayout(preset)) throw new Error("Map should be a panels preset");

    const resized = resizeMapPresetForViewport(preset.layoutItems, 900);
    expect(resized.find((item) => item.id === "panel-1")).toMatchObject({ y: 1, h: 6 });
    expect(resized.find((item) => item.id === "strip-1")).toMatchObject({ y: 0 });
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
