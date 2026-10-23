import { describe, expect, it } from "vitest";
import type { ChartDataEntry } from "../EventsPanels/ChartDataRegistry";
import {
  buildInstanceUISnapshot,
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
  layoutItems: [{ id: "panel-1", kind: "panel", x: 0, y: 0, w: 6, h: 4 }],
  panelTypesById: { "panel-1": "damage_done" },
  panelOptionsById: { "panel-1": "g:merged" },
  panelFiltersById: { "panel-1": [{ type: "ability_name", value: ["Fireball"] }] },
  availablePanelTypes: ["damage_done", "healing_done"],
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
        items: state.layoutItems,
      },
      panels: [{
        id: "panel-1",
        type: "damage_done",
        option: "g:merged",
        filters: [{ type: "ability_name", value: ["Fireball"] }],
        queryable: true,
      }],
      capabilities: {
        panelTypes: ["damage_done", "healing_done"],
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
