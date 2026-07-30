import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { EventsPanelType } from "./EventsPanels";
import type { PanelFilter } from "./EventsPanels/processors/filters";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
  DEFAULT_INSTANCE_PANEL_FILTERS,
} from "./viewDefaults";

// ── Preset Layout Definition ────────────────────────────────────────────────

export interface PresetLayout {
  id: string;
  label: string;
  layoutItems: GridEditorItem[];
  panelTypes: Record<string, EventsPanelType>;
  panelOptions: Record<string, string>;
  panelFilters: Record<string, PanelFilter[]>;
}

// ── Shared timeline series config ───────────────────────────────────────────
// All presets share the same 5-series timeline (Damage Done, Healing, Damage
// Taken, Effective Healing, Friendly Fire) with different hidden series per
// preset.  Colours stay in sync because they come from a single source object.

const TIMELINE_SERIES = {
  series: [
    { id: "s0", name: "Damage Done", stream: "damage", aggregation: "rolling_avg", color: "#117ae4", filters: [{ type: "source_type", value: ["pet", "player"], applyTo: ["damage"] }, { type: "target_type", value: ["enemy_pet", "enemy"], combinator: "and", applyTo: ["damage"] }] },
    { id: "s1", name: "Healing", stream: "heal", aggregation: "rolling_avg", color: "#c1e194", filters: [{ type: "source_type", value: ["pet", "player"], applyTo: ["heal", "absorbed"] }, { type: "target_type", value: ["player", "pet"], combinator: "and", applyTo: ["heal", "absorbed"] }] },
    { id: "s2", name: "Damage Taken", stream: "damage", aggregation: "rolling_avg", color: "#ec1337", filters: [{ type: "source_type", value: ["enemy", "enemy_pet"] }, { type: "target_type", value: ["player", "pet"], combinator: "and" }] },
    { id: "s3", name: "Effective Healing", stream: "effective_heal", aggregation: "rolling_avg", color: "#85e203", filters: [{ type: "source_type", value: ["player", "pet"] }, { type: "target_type", value: ["pet", "player"], combinator: "and" }] },
    { id: "s4", name: "Friendly Fire", stream: "damage", aggregation: "sum", color: "#FF7D0A", filters: [{ type: "source_type", value: ["player", "pet"] }, { type: "target_type", value: ["player", "pet"], combinator: "and" }] },
  ],
  settings: { binMs: 500 },
};

/** Build the full panel-1 option string for the timeline with the given hidden series. */
function timelineOption(hiddenSeries: string[]): string {
  const obj = {
    ...TIMELINE_SERIES,
    settings: {
      ...TIMELINE_SERIES.settings,
      ...(hiddenSeries.length > 0 ? { hiddenSeries } : {}),
    },
  };
  const encoded = btoa(JSON.stringify(obj));
  return `bc:#3b82f6,t:RollingAverages,tl:${encoded}`;
}

// ── Reusable layout grids ───────────────────────────────────────────────────

/** 5-panel grid: 1 full-width top + 2×2 below */
const FIVE_PANEL_GRID = DEFAULT_INSTANCE_LAYOUT_ITEMS;

/** 4-panel grid: 2×2 */
const FOUR_PANEL_GRID: GridEditorItem[] = [
  { id: "panel-1", title: "Panel 1", x: 0, y: 0, w: 6, h: 5, minW: 4 },
  { id: "panel-2", title: "Panel 2", x: 6, y: 0, w: 6, h: 5, minW: 4 },
  { id: "panel-3", title: "Panel 3", x: 0, y: 5, w: 6, h: 5, minW: 4 },
  { id: "panel-4", title: "Panel 4", x: 6, y: 5, w: 6, h: 5, minW: 4 },
];

/** 3-panel grid: 1 full-width + 2 half-width */
const THREE_PANEL_GRID: GridEditorItem[] = [
  { id: "panel-1", title: "Panel 1", x: 0, y: 0, w: 12, h: 5, minW: 4 },
  { id: "panel-2", title: "Panel 2", x: 0, y: 5, w: 6, h: 5, minW: 4 },
  { id: "panel-3", title: "Panel 3", x: 6, y: 5, w: 6, h: 5, minW: 4 },
];

// ── Standard damage filters ─────────────────────────────────────────────────

const DAMAGE_TIME_RANGE_FILTER: PanelFilter = { type: "time_range", value: "controller", applyTo: ["damage"] };
const DAMAGE_TARGET_ENEMIES_FILTER: PanelFilter = { type: "target_type", value: "selected_enemies", applyTo: ["damage"] };
const DAMAGE_SOURCE_ENEMIES_FILTER: PanelFilter = { type: "source_type", value: "selected_enemies", applyTo: ["damage"] };
const HEAL_TIME_RANGE_FILTER: PanelFilter = { type: "time_range", value: "controller", applyTo: ["heal", "absorbed"] };
const HEAL_TARGET_PLAYERS_FILTER: PanelFilter = { type: "target_type", value: "selected_players", applyTo: ["heal", "absorbed"] };

// ── Preset Definitions ──────────────────────────────────────────────────────

export const PRESET_LAYOUTS: PresetLayout[] = [
  {
    id: "summary",
    label: "Summary",
    layoutItems: FIVE_PANEL_GRID,
    panelTypes: DEFAULT_INSTANCE_PANEL_TYPES,
    panelOptions: {
      "panel-1": timelineOption(["s1", "s4"]),  // hide Healing, Friendly Fire
      "panel-2": "g:merged,p:owner",
      "panel-3": "g:merged,p:owner",
      "panel-4": "g:default,p:individual",
      "panel-5": "g:merged,p:owner",
    },
    panelFilters: DEFAULT_INSTANCE_PANEL_FILTERS,
  },
  {
    id: "damage",
    label: "Damage",
    layoutItems: FIVE_PANEL_GRID,
    panelTypes: {
      "panel-1": "timeline",
      "panel-2": "damage_done",
      "panel-3": "enemy_damage_done",
      "panel-4": "damage_done_friendly_fire",
      "panel-5": "enemy_damage_taken",
    },
    panelOptions: {
      "panel-1": timelineOption(["s1", "s3"]),  // hide Healing, Effective Healing
    },
    panelFilters: {
      "panel-2": [DAMAGE_TIME_RANGE_FILTER, DAMAGE_TARGET_ENEMIES_FILTER],
      "panel-3": [
        DAMAGE_TIME_RANGE_FILTER,
        { type: "target_type", value: "selected_players", applyTo: ["damage"] },
      ],
      "panel-4": [
        DAMAGE_TIME_RANGE_FILTER,
        { type: "target_type", value: "selected_players", applyTo: ["damage"] },
      ],
      "panel-5": [
        DAMAGE_TIME_RANGE_FILTER,
        { type: "source_type", value: "selected_players", applyTo: ["damage"] },
      ],
    },
  },
  {
    id: "healing",
    label: "Healing",
    layoutItems: FIVE_PANEL_GRID,
    panelTypes: {
      "panel-1": "timeline",
      "panel-2": "healing_done",
      "panel-3": "healing_taken",
      "panel-4": "damage_taken",
      "panel-5": "judgement",
    },
    panelOptions: {
      "panel-1": timelineOption(["s0", "s2", "s4"]),  // hide Damage Done, Damage Taken, Friendly Fire
      "panel-2": "g:merged,p:owner",
      "panel-3": "g:merged,p:owner",
    },
    panelFilters: {
      "panel-2": [HEAL_TIME_RANGE_FILTER, HEAL_TARGET_PLAYERS_FILTER],
      "panel-3": [HEAL_TIME_RANGE_FILTER, HEAL_TARGET_PLAYERS_FILTER],
      "panel-4": [
        DAMAGE_TIME_RANGE_FILTER,
        DAMAGE_SOURCE_ENEMIES_FILTER,
      ],
    },
  },
  {
    id: "dispels",
    label: "Dispels",
    layoutItems: THREE_PANEL_GRID,
    panelTypes: {
      "panel-1": "dispel_log",
      "panel-2": "dispels_done",
      "panel-3": "dispels_received",
    },
    panelOptions: {},
    panelFilters: {},
  },
  {
    id: "interrupts",
    label: "Interrupts",
    layoutItems: [
      { id: "panel-1", title: "Panel 1", x: 0, y: 0, w: 6, h: 5, minW: 4 },
      { id: "panel-2", title: "Panel 2", x: 6, y: 0, w: 6, h: 5, minW: 4 },
    ],
    panelTypes: {
      "panel-1": "interrupts",
      "panel-2": "interrupt_log",
    },
    panelOptions: {},
    panelFilters: {},
  },
  {
    id: "deaths",
    label: "Deaths",
    layoutItems: FOUR_PANEL_GRID,
    panelTypes: {
      "panel-1": "deaths",
      "panel-2": "death_log",
      "panel-3": "damage_taken",
      "panel-4": "death_log",
    },
    panelOptions: {
      "panel-2": "m:players",
      "panel-3": "g:default,p:individual",
      "panel-4": "m:enemies",
    },
    panelFilters: {
      "panel-3": [DAMAGE_TIME_RANGE_FILTER, DAMAGE_SOURCE_ENEMIES_FILTER],
    },
  },
  {
    id: "loot",
    label: "Loot",
    layoutItems: [
      { id: "panel-1", title: "Loot", x: 0, y: 0, w: 12, h: 6, minW: 4 },
      { id: "panel-2", title: "Roles", x: 0, y: 6, w: 12, h: 5, minW: 4 },
    ],
    panelTypes: {
      "panel-1": "loot",
      "panel-2": "roles",
    },
    panelOptions: {},
    panelFilters: {},
  },
  {
    id: "meta",
    label: "Meta",
    layoutItems: [
      { id: "panel-6", title: "All Activity", x: 0, y: 0, w: 12, h: 4, minW: 4 },
      { id: "panel-7", title: "Periods", x: 0, y: 4, w: 12, h: 4, minW: 4 },
      { id: "panel-3", title: "Possession", x: 0, y: 8, w: 12, h: 4, minW: 4 },
      { id: "panel-4", title: "Logging Metadata", x: 0, y: 12, w: 6, h: 5, minW: 4 },
      { id: "panel-5", title: "Unit Lookup", x: 6, y: 12, w: 6, h: 5, minW: 4 },
      { id: "panel-8", title: "Leaderboard", x: 0, y: 17, w: 12, h: 4, minW: 4 },
    ],
    panelTypes: {
      "panel-6": "all_activity",
      "panel-7": "periods",
      "panel-3": "possession",
      "panel-4": "logging_metadata",
      "panel-5": "unit_lookup",
      "panel-8": "leaderboard",
    },
    panelOptions: {
      "panel-6": "s:dhxz",
    },
    panelFilters: {
      "panel-6": [{ type: "time_range", value: "controller" }],
    },
  },
];

export const PRESET_LAYOUTS_BY_ID = Object.fromEntries(
  PRESET_LAYOUTS.map((p) => [p.id, p]),
) as Record<string, PresetLayout>;

export const DEFAULT_PRESET_ID = "summary";
