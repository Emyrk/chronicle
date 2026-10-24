import { describe, expect, it } from "vitest";
import type { ChartDataEntry } from "../EventsPanels/ChartDataRegistry";
import {
  buildInstanceUISnapshot,
  planInstanceLayoutUpdate,
  planInstanceUIUpdate,
  queryMetricPanel,
  type InstanceUIState,
} from "./instanceInferenceTools";

const state: InstanceUIState = {
  revision: 4,
  instanceId: "instance-1",
  instanceName: "Blackwing Lair",
  selectedEncounterIds: ["encounter-1"],
  selectedPlayerIds: ["player-1"],
  selectedEnemyIds: [],
  includeWipes: false,
  timeRange: { enabled: true, startOffsetMs: 1000, endOffsetMs: 5000 },
  presetId: "damage",
  layoutAppearance: { seamless: false },
  layoutItems: [{ id: "panel-1", kind: "panel", title: "Panel 1", x: 0, y: 0, w: 6, h: 4 }],
  panelTypesById: { "panel-1": "damage_done" },
  panelOptionsById: { "panel-1": "g:merged" },
  panelFiltersById: { "panel-1": [{ type: "ability_name", value: ["Fireball"] }] },
  availableEncounterIds: ["encounter-1", "encounter-2"],
  availablePlayerIds: ["player-1"],
  availableEnemyIds: [],
  availablePanelCatalog: [
    {
      id: "damage_done",
      label: "Damage Done",
      description: "Compares player damage dealt.",
      queryable: true,
      hidden: false,
    },
    {
      id: "healing_done",
      label: "Healing Done",
      description: "Compares effective healing performed.",
      queryable: true,
      hidden: false,
    },
    {
      id: "custom:github:owner/repo:meter",
      label: "Custom Meter",
      description: "An installed custom panel.",
      queryable: false,
      hidden: false,
    },
  ],
  availablePanelTypes: ["damage_done", "healing_done", "custom:github:owner/repo:meter"],
  availableStripCatalog: [{
    id: "raid_durability",
    label: "Raid Durability",
    defaultOrientation: "horizontal",
    supportedOrientations: ["horizontal"],
    size: { minLength: 6, preferredLength: 12, minThickness: 1, preferredThickness: 1, maxThickness: 2 },
  }],
  availablePresets: ["summary", "damage", "healing"],
};

describe("instance inference tools", () => {
  it("builds a bounded serializable snapshot", () => {
    expect(buildInstanceUISnapshot(state, ["selection", "layout", "panels"])).toEqual({
      schemaVersion: 1,
      revision: 4,
      instance: { id: "instance-1", name: "Blackwing Lair" },
      selection: {
        encounterIds: ["encounter-1"],
        playerIds: ["player-1"],
        enemyIds: [],
        includeWipes: false,
        timeRange: { enabled: true, startOffsetMs: 1000, endOffsetMs: 5000 },
      },
      layout: {
        presetId: "damage",
        appearance: { seamless: false },
        items: state.layoutItems,
      },
      panels: [{
        id: "panel-1",
        type: "damage_done",
        option: "g:merged",
        filters: [{ type: "ability_name", value: ["Fireball"] }],
        queryable: true,
      }],
    });
    expect(buildInstanceUISnapshot(state, ["capabilities"])).toMatchObject({
      capabilities: {
        panelTypes: ["damage_done", "healing_done", "custom:github:owner/repo:meter"],
        panelCatalog: state.availablePanelCatalog,
        stripCatalog: state.availableStripCatalog,
        presets: ["summary", "damage", "healing"],
      },
    });
  });

  it("returns bounded normalized metric rows", () => {
    const entries = new Map<string, ChartDataEntry>([["panel-1", {
      panelId: "panel-1",
      panelIndex: 0,
      panelType: "damage_done",
      label: "Damage Done",
      borderColor: null,
      data: [
        { playerID: "b", playerName: "Beta", className: "Mage", specialization: "Fire", value: 10 },
        { playerID: "a", playerName: "Alpha", className: "Warrior", specialization: "Fury", value: 20, stackedValue: 2 },
      ],
    }]]);

    expect(queryMetricPanel(entries, { panel_id: "panel-1", limit: 1 })).toEqual({
      panelId: "panel-1",
      panelType: "damage_done",
      label: "Damage Done",
      view: "top_entities",
      truncated: true,
      totalRows: 2,
      rows: [{ entityId: "a", name: "Alpha", className: "Warrior", specialization: "Fury", value: 20, secondaryValue: 2 }],
    });
  });

  it("plans an atomic layout replacement from sequential operations", () => {
    const plan = planInstanceLayoutUpdate(state, {
      expected_revision: 4,
      operations: [
        { op: "add_group", item_id: "group-1", title: "Throughput", x: 0, y: 4 },
        { op: "add_panel", item_id: "panel-2", panel_type: "healing_done", x: 0, y: 0, w: 6, h: 4 },
        { op: "move_into_group", item_id: "panel-2", group_id: "group-1", x: 0, y: 0 },
        { op: "move_item", item_id: "panel-1", x: 6, y: 0 },
        { op: "set_appearance", seamless: true },
      ],
    });

    expect(plan.expectedRevision).toBe(4);
    expect(plan.layout).toMatchObject({
      version: 1,
      seamless: true,
      panelTypesById: { "panel-1": "damage_done", "panel-2": "healing_done" },
    });
    expect(plan.layout.items.find((item) => item.id === "group-1")).toMatchObject({
      kind: "group",
      title: "Throughput",
      x: 0,
      y: 4,
      w: 12,
    });
    expect(plan.layout.items.find((item) => item.id === "panel-2")).toMatchObject({
      groupId: "group-1",
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
    expect(plan.summaries).toHaveLength(5);
  });

  it("returns geometry after the same outer-grid compaction used when applying", () => {
    const plan = planInstanceLayoutUpdate(state, {
      operations: [{ op: "move_item", item_id: "panel-1", x: 0, y: 100 }],
    });
    expect(plan.layout.items.find((item) => item.id === "panel-1")).toMatchObject({ x: 0, y: 0 });
  });

  it("adds strips and installed custom panels and preserves existing ones", () => {
    const plan = planInstanceLayoutUpdate(state, {
      operations: [
        { op: "add_strip", item_id: "strip-1", strip_type: "raid_durability", x: 0, y: 4 },
        { op: "add_panel", item_id: "custom-1", panel_type: "custom:github:owner/repo:meter", x: 0, y: 5, w: 6, h: 4 },
        { op: "set_appearance", seamless: true },
      ],
    });
    expect(plan.layout.items.find((item) => item.id === "strip-1")).toMatchObject({
      kind: "strip",
      stripType: "raid_durability",
      orientation: "horizontal",
      w: 12,
      h: 1,
    });
    expect(plan.layout.items.find((item) => item.id === "custom-1")).toMatchObject({ kind: "panel", title: "Custom Meter" });
    expect(plan.layout.panelTypesById["custom-1"]).toBe("custom:github:owner/repo:meter");

    const existingCustom = planInstanceLayoutUpdate({
      ...state,
      panelTypesById: { "panel-1": "custom:github:owner/repo:meter" },
    }, { operations: [{ op: "set_appearance", seamless: true }] });
    expect(existingCustom.layout.panelTypesById["panel-1"]).toBe("custom:github:owner/repo:meter");
    const existing = planInstanceLayoutUpdate({
      ...state,
      layoutItems: [{ ...state.layoutItems[0], kind: "strip", stripType: "raid_durability", h: 1, minW: 6, minH: 1, maxH: 2 }],
      panelTypesById: {},
    }, { operations: [{ op: "set_appearance", seamless: true }] });
    expect(existing.layout.items[0]).toMatchObject({ kind: "strip", stripType: "raid_durability" });
  });

  it("rejects invalid layout operations without producing a partial layout", () => {
    expect(() => planInstanceLayoutUpdate(state, {
      expected_revision: 3,
      operations: [{ op: "remove_item", item_id: "panel-1" }],
    })).toThrow("stale_state");
    expect(() => planInstanceLayoutUpdate(state, {
      operations: [{ op: "add_panel", item_id: "panel-2", panel_type: "missing", x: 0, y: 4, w: 6, h: 4 }],
    })).toThrow("unknown_panel_type");
    expect(() => planInstanceLayoutUpdate(state, {
      operations: [{ op: "add_panel", item_id: "panel-2", panel_type: "healing_done", x: 5, y: 0, w: 6, h: 4 }],
    })).toThrow("overlapping_layout_items");
    expect(() => planInstanceLayoutUpdate(state, {
      operations: [{ op: "add_strip", item_id: "strip-1", strip_type: "missing", x: 0, y: 4 }],
    })).toThrow("unknown_strip_type");
    expect(() => planInstanceLayoutUpdate(state, {
      operations: [{ op: "add_strip", item_id: "strip-1", strip_type: "raid_durability", orientation: "vertical", x: 0, y: 4 }],
    })).toThrow("unsupported_strip_orientation");
    expect(() => planInstanceLayoutUpdate(state, {
      operations: [{ op: "add_panel", item_id: "panel 2", panel_type: "healing_done", x: 0, y: 4, w: 6, h: 4 }],
    })).toThrow("invalid_item_id");
    expect(() => planInstanceLayoutUpdate(state, {
      operations: [{ op: "add_group", item_id: "group-1", title: null as unknown as string, x: 0, y: 4 }],
    })).toThrow("invalid_layout_text");
    expect(() => planInstanceLayoutUpdate(state, {
      operations: [{ op: "add_group", item_id: "group-1", title: "Nested", x: 0, y: 4 }, { op: "move_into_group", item_id: "group-1", group_id: "group-1", x: 0, y: 0 }],
    })).toThrow("invalid_group_membership");
  });

  it("validates an atomic mutation plan without applying partial changes", () => {
    expect(planInstanceUIUpdate(state, {
      expected_revision: 4,
      operations: [
        { op: "set_panel", panel_id: "panel-1", panel_type: "healing_done" },
        { op: "select_encounters", ids: ["encounter-2"] },
        { op: "set_time_range", start_offset_ms: 0, end_offset_ms: 2000 },
      ],
    })).toMatchObject({
      expectedRevision: 4,
      summaries: [
        "Change panel panel-1 to Healing Done",
        "Select 1 encounter",
        "Set time range to 0–2000 ms",
      ],
    });

    expect(() => planInstanceUIUpdate(state, {
      expected_revision: 3,
      operations: [{ op: "set_panel", panel_id: "panel-1", panel_type: "healing_done" }],
    })).toThrow("stale_state");
    expect(() => planInstanceUIUpdate(state, {
      expected_revision: 4,
      operations: [{ op: "set_panel", panel_id: "missing", panel_type: "healing_done" }],
    })).toThrow("unknown_panel");
  });
});
