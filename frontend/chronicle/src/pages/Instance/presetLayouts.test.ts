import { describe, expect, it } from "vitest";
import { DEFAULT_INSTANCE_PANEL_OPTIONS } from "./viewDefaults";
import {
  arrangeWatchPresetForFocus,
  DEFAULT_PRESET_ID,
  defaultInstanceLayout,
  getAvailablePresetLayouts,
  isPanelPresetLayout,
  mapPresetRowsForViewport,
  resizeMapPresetForViewport,
  resizePresetForViewport,
  resizeWatchPresetForViewport,
  watchDirectorRows,
  watchPresetSideRows,
  withoutOwnerSidekickStrip,
  PRESET_LAYOUTS,
  PRESET_LAYOUTS_BY_ID,
  presetLayoutById,
} from "./presetLayouts";
import {
  deserializeTimelineConfig,
  extractTimelineToken,
} from "./EventsPanels/Timeline/timelineTypes";
import { parseMapPanelOptions } from "./EventsPanels/Map/mapPanelOptions";
import { isCompactDeathsOption } from "./EventsPanels/Deaths/compactDeaths";
import { isMeterBarsOption } from "./EventsPanels/metricPanelLiveState";

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

  it("is the built-in default only for logs without positions", () => {
    const without = defaultInstanceLayout([]);
    expect(without.presetId).toBe(DEFAULT_PRESET_ID);
    expect(without.items.some((item) => without.panelTypes[item.id] === "mini_map")).toBe(false);
    expect(defaultInstanceLayout(["unit-position"]).presetId).toBe("watch");
  });
});

describe("Watch preset", () => {
  function watchPreset(mobile = false) {
    const preset = presetLayoutById("watch", ["unit-position"], mobile);
    if (!preset || !isPanelPresetLayout(preset)) throw new Error("Watch should be a panels preset");
    return preset;
  }

  it("is listed first and needs unit positions", () => {
    expect(PRESET_LAYOUTS[0].id).toBe("watch");
    expect(PRESET_LAYOUTS[0].label).toBe("Watch");
    expect(getAvailablePresetLayouts([]).map((preset) => preset.id)).not.toContain("watch");
    expect(getAvailablePresetLayouts(["unit-position"])[0].id).toBe("watch");
    // Summary stays the fallback; Watch is the default only where it is offered.
    expect(DEFAULT_PRESET_ID).toBe("summary");
  });

  it("puts the map beside party, deaths and one meter under the replay and Sidekick strips", () => {
    const preset = watchPreset();
    expect(preset.seamless).toBe(true);
    expect(preset.fit).toBe(true);
    const byId = Object.fromEntries(preset.layoutItems.map((item) => [item.id, item]));
    expect(byId["strip-1"]).toMatchObject({ kind: "strip", stripType: "replay", x: 0, y: 0, w: 9, h: 1 });
    expect(byId["strip-2"]).toMatchObject({ kind: "strip", stripType: "sidekick", x: 9, y: 0, w: 3, h: 1 });
    expect(byId["panel-1"]).toMatchObject({ x: 0, y: 1, w: 8, h: 9 });
    expect(byId["panel-2"]).toMatchObject({ x: 8, y: 1, w: 4, h: 3 });
    expect(byId["panel-3"]).toMatchObject({ x: 8, y: 4, w: 4, h: 4 });
    expect(byId["panel-4"]).toMatchObject({ x: 8, y: 8, w: 4, h: 2 });
    expect(preset.panelTypes).toEqual({
      "panel-1": "map",
      "panel-2": "raid_frames",
      "panel-3": "deaths",
      "panel-4": "damage_done",
    });
  });

  it("opens the map on the whole run, playing, with the toolbar collapsed; compact deaths; a bars-only meter", () => {
    const preset = watchPreset();
    expect(parseMapPanelOptions(preset.panelOptions["panel-1"])).toEqual({ wholeRun: true, autoplay: true, toolbarCollapsed: true });
    expect(isCompactDeathsOption(preset.panelOptions["panel-3"])).toBe(true);
    expect(preset.panelOptions["panel-4"]).toContain("g:merged,p:owner");
    expect(isMeterBarsOption(preset.panelOptions["panel-4"])).toBe(true);
    expect(preset.panelOptions["panel-2"]).toBeUndefined();
  });

  it("stacks map, replay strip, party and deaths on mobile without fitting", () => {
    const mobile = watchPreset(true);
    expect(mobile.fit).toBe(false);
    expect(mobile.layoutItems.map((item) => [item.id, item.y, item.w, item.h])).toEqual([
      ["panel-1", 0, 12, 4],
      ["strip-1", 4, 12, 1],
      ["panel-2", 5, 12, 2],
      ["panel-3", 7, 12, 3],
      ["strip-2", 10, 12, 1],
    ]);
  });

  it("drops the Sidekick strip for the owner and gives the replay strip the full row", () => {
    const items = watchPreset().layoutItems;
    expect(withoutOwnerSidekickStrip("watch", items, false)).toBe(items);
    expect(withoutOwnerSidekickStrip("summary", items, true)).toBe(items);
    const owner = withoutOwnerSidekickStrip("watch", items, true);
    expect(owner.map((item) => item.id)).not.toContain("strip-2");
    expect(owner.find((item) => item.id === "strip-1")).toMatchObject({ x: 0, w: 12 });
    const mobile = withoutOwnerSidekickStrip("watch", watchPreset(true).layoutItems, true);
    expect(mobile.map((item) => item.id)).toEqual(["panel-1", "strip-1", "panel-2", "panel-3"]);
  });

  it.each([4, 5, 6, 7, 8, 9])("splits %i map rows into a side column of the same height", (mapRows) => {
    const side = watchPresetSideRows(mapRows);
    expect(side.party + side.deaths + side.damage).toBe(mapRows);
    expect(Math.min(side.party, side.deaths, side.damage)).toBeGreaterThanOrEqual(1);
    expect(side.deaths).toBeGreaterThanOrEqual(side.party);
  });

  it.each([720, 900, 1080, 1600])("fits every panel beside the map on a %ipx-tall viewport", (viewportHeight) => {
    const resized = resizeWatchPresetForViewport(watchPreset().layoutItems, viewportHeight);
    const byId = Object.fromEntries(resized.map((item) => [item.id, item]));
    const mapBottom = byId["panel-1"].y + byId["panel-1"].h;
    expect(byId["panel-1"].h).toBe(mapPresetRowsForViewport(viewportHeight));
    expect(byId["strip-1"]).toMatchObject({ y: 0, h: 1 });
    expect(byId["panel-2"].y).toBe(1);
    expect(byId["panel-3"].y).toBe(byId["panel-2"].y + byId["panel-2"].h);
    expect(byId["panel-4"].y).toBe(byId["panel-3"].y + byId["panel-3"].h);
    expect(byId["panel-4"].y + byId["panel-4"].h).toBe(mapBottom);
  });

  it("resizes only the Map and Watch presets", () => {
    const watch = watchPreset().layoutItems;
    expect(resizePresetForViewport("watch", watch, 720)).toEqual(resizeWatchPresetForViewport(watch, 720));
    const map = PRESET_LAYOUTS_BY_ID.map;
    if (!isPanelPresetLayout(map)) throw new Error("Map should be a panels preset");
    expect(resizePresetForViewport("map", map.layoutItems, 720)).toEqual(resizeMapPresetForViewport(map.layoutItems, 720));
    const summary = PRESET_LAYOUTS_BY_ID.summary;
    if (!isPanelPresetLayout(summary)) throw new Error("Summary should be a panels preset");
    expect(resizePresetForViewport("summary", summary.layoutItems, 720)).toBe(summary.layoutItems);
    expect(resizePresetForViewport(null, watch, 720)).toBe(watch);
  });

  it("is the built-in default for logs with positions on desktop", () => {
    const layout = defaultInstanceLayout(["unit-position"]);
    expect(layout.presetId).toBe("watch");
    expect(layout.items).toBe(watchPreset().layoutItems);
    expect(layout.panelTypes).toBe(watchPreset().panelTypes);
    expect(layout.panelOptions).toBe(watchPreset().panelOptions);
    expect(layout.panelFilters).toBe(watchPreset().panelFilters);
    expect(layout.appearance).toEqual({ seamless: true, fit: true });
    // Phones keep the plain Summary grid.
    expect(defaultInstanceLayout(["unit-position"], true).presetId).toBe(DEFAULT_PRESET_ID);
  });

  it("opens on a ?preset= the log offers, and ignores one it doesn't", () => {
    expect(defaultInstanceLayout(["unit-position"], false, "damage")).toMatchObject({
      presetId: "damage",
      items: (PRESET_LAYOUTS_BY_ID.damage as { layoutItems: unknown }).layoutItems,
    });
    expect(defaultInstanceLayout(["unit-position"], false, "watch").presetId).toBe("watch");
    // Summary asked for by name is the Summary tab (mini map for position logs).
    const summary = defaultInstanceLayout(["unit-position"], false, "summary");
    expect(summary.presetId).toBe("summary");
    expect(Object.values(summary.panelTypes)).toContain("mini_map");
    expect(defaultInstanceLayout([], false, "watch").presetId).toBe(DEFAULT_PRESET_ID);
    expect(defaultInstanceLayout(["unit-position"], false, "nope").presetId).toBe("watch");
  });

  it.each([720, 900, 1080, 1440])("arranges the Director stage in focus mode on a %ipx-tall viewport", (viewportHeight) => {
    const watch = watchPreset().layoutItems;
    const director = resizePresetForViewport("watch", watch, viewportHeight, true);
    expect(director).toEqual(arrangeWatchPresetForFocus(watch, viewportHeight));
    const rows = watchDirectorRows(viewportHeight);
    const byId = Object.fromEntries(director.map((item) => [item.id, item]));
    expect(byId["panel-1"]).toMatchObject({ x: 0, y: 0, w: 12, h: rows.map });
    expect(byId["strip-1"]).toMatchObject({ x: 0, y: rows.map, w: 9, h: 1 });
    expect(byId["strip-2"]).toMatchObject({ x: 9, y: rows.map, w: 3, h: 1 });
    expect([byId["panel-2"], byId["panel-3"], byId["panel-4"]].map((item) => [item.x, item.y, item.w, item.h])).toEqual([
      [0, rows.map + 1, 4, rows.row], [4, rows.map + 1, 4, rows.row], [8, rows.map + 1, 4, rows.row],
    ]);
    // Every row keeps fit's 96px minimum inside the focus-mode viewport.
    expect(72 + 96 * (rows.map + 1 + rows.row)).toBeLessThanOrEqual(viewportHeight);
    expect(rows.map).toBeGreaterThan(rows.row);
    // Same items, so the panels stay mounted.
    expect(director.map((item) => item.id)).toEqual(watch.map((item) => item.id));
  });

  it("uses the full Director grid (map 6 over a row of 3) on tall screens; other presets ignore focus", () => {
    expect(watchDirectorRows(1080)).toEqual({ map: 6, row: 3 });
    // The owner's Watch has no Sidekick strip: the replay strip takes the full row.
    const owner = resizePresetForViewport("watch", withoutOwnerSidekickStrip("watch", watchPreset().layoutItems, true), 1080, true);
    expect(owner.find((item) => item.id === "strip-2")).toBeUndefined();
    expect(owner.find((item) => item.id === "strip-1")).toMatchObject({ x: 0, y: 6, w: 12, h: 1 });
    const map = PRESET_LAYOUTS_BY_ID.map;
    if (!isPanelPresetLayout(map)) throw new Error("Map should be a panels preset");
    expect(resizePresetForViewport("map", map.layoutItems, 720, true)).toEqual(resizeMapPresetForViewport(map.layoutItems, 720));
  });

  it("leaves the other presets where they were", () => {
    expect(PRESET_LAYOUTS.slice(1).map((preset) => preset.id)).toEqual([
      "summary", "damage", "healing", "dispels", "interrupts", "deaths", "player_timeline", "map", "loot", "meta",
    ]);
  });
});
