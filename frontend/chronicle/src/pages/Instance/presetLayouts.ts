import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { EventsPanelType } from "./EventsPanels";
import type { PanelFilter } from "./EventsPanels/processors/filters";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
  DEFAULT_INSTANCE_PANEL_FILTERS,
  POSITION_SUMMARY_CAPABILITY,
  POSITION_SUMMARY_LAYOUT_ITEMS,
  POSITION_SUMMARY_PANEL_TYPES,
} from "./viewDefaults";
import { WATCH_MAP_PANEL_OPTION } from "./EventsPanels/Map/mapPanelOptions";
import { COMPACT_DEATHS_PANEL_OPTION } from "./EventsPanels/Deaths/compactDeaths";
import { METER_BARS_PANEL_OPTION } from "./EventsPanels/metricPanelLiveState";

// ── Preset Layout Definition ────────────────────────────────────────────────

interface PresetLayoutBase {
  id: string;
  label: string;
  requiredCapabilities?: string[];
}

export const INSTANCE_PAGE_TYPES = ["empty", "player_timeline"] as const;

export type InstancePageType = (typeof INSTANCE_PAGE_TYPES)[number];

export function isInstancePageType(value: unknown): value is InstancePageType {
  return (INSTANCE_PAGE_TYPES as readonly unknown[]).includes(value);
}

export interface PagePresetLayout extends PresetLayoutBase {
  kind: "page";
  pageType: InstancePageType;
}

export interface PanelPresetLayout extends PresetLayoutBase {
  kind: "panels";
  layoutItems: GridEditorItem[];
  panelTypes: Record<string, EventsPanelType>;
  panelOptions: Record<string, string>;
  panelFilters: Record<string, PanelFilter[]>;
  /** Butt panels and strips together with no gaps or rounding (guild pages' "Seamless"). */
  seamless?: boolean;
  /** In focus mode, stretch panel rows to fill the screen. */
  fit?: boolean;
  /** Mobile-only sizing/fit overrides; panel contents and options stay unchanged. */
  mobileVariant?: {
    layoutItems: GridEditorItem[];
    fit?: boolean;
  };
  /** A different grid for logs that have these capabilities (e.g. Summary's mini map for position logs). */
  capabilityVariant?: {
    requiredCapabilities: string[];
    /** Not on mobile (e.g. no 3D mini map on a phone). */
    desktopOnly?: boolean;
    layoutItems: GridEditorItem[];
    panelTypes: Record<string, EventsPanelType>;
    /** Merged over the base preset's options. */
    panelOptions: Record<string, string>;
  };
}

export type PresetLayout = PagePresetLayout | PanelPresetLayout;

export function isPanelPresetLayout(preset: PresetLayout): preset is PanelPresetLayout {
  return preset.kind === "panels";
}

const MAP_PRESET_MIN_ROWS = 4;
const MAP_PRESET_MAX_ROWS = 9;

/** Keep the Map preset and its replay strip above the fold on shorter screens. */
export function mapPresetRowsForViewport(viewportHeight: number): number {
  if (viewportHeight < 800) return MAP_PRESET_MIN_ROWS;
  if (viewportHeight < 900) return 5;
  if (viewportHeight < 1050) return 6;
  if (viewportHeight < 1250) return 7;
  if (viewportHeight < 1450) return 8;
  return MAP_PRESET_MAX_ROWS;
}

/** Resize only the stable Map preset items, leaving custom layouts untouched. */
export function resizeMapPresetForViewport(layoutItems: readonly GridEditorItem[], viewportHeight: number): GridEditorItem[] {
  const mapRows = mapPresetRowsForViewport(viewportHeight);
  return layoutItems.map((item) => {
    if (item.id === "panel-1") return item.h === mapRows && item.y === 1 ? item : { ...item, y: 1, h: mapRows };
    if (item.id === "strip-1") return item.y === 0 ? item : { ...item, y: 0 };
    return item;
  });
}

/** The Watch preset's side column (Party, Deaths, Damage), sharing the map's rows in its 3:4:2 proportion. */
export function watchPresetSideRows(mapRows: number): { party: number; deaths: number; damage: number } {
  const party = Math.max(1, Math.round((mapRows * 3) / 9));
  const damage = Math.max(1, Math.round((mapRows * 2) / 9));
  return { party, deaths: Math.max(1, mapRows - party - damage), damage };
}

/** Resize only the stable Watch preset items: the map as in the Map preset, the side column beside it. */
export function resizeWatchPresetForViewport(layoutItems: readonly GridEditorItem[], viewportHeight: number): GridEditorItem[] {
  const mapRows = mapPresetRowsForViewport(viewportHeight);
  const side = watchPresetSideRows(mapRows);
  const sized: Record<string, { y: number; h: number }> = {
    "panel-1": { y: 1, h: mapRows },
    "panel-2": { y: 1, h: side.party },
    "panel-3": { y: 1 + side.party, h: side.deaths },
    "panel-4": { y: 1 + side.party + side.deaths, h: side.damage },
  };
  return layoutItems.map((item) => {
    if (item.id === "strip-1") return item.y === 0 ? item : { ...item, y: 0 };
    const size = sized[item.id];
    if (!size) return item;
    return item.y === size.y && item.h === size.h ? item : { ...item, ...size };
  });
}

/** The visible grid for a preset on this viewport: the Map and Watch presets fit it, others are untouched. */
export function resizePresetForViewport(presetId: string | null, layoutItems: GridEditorItem[], viewportHeight: number): GridEditorItem[] {
  if (presetId === "map") return resizeMapPresetForViewport(layoutItems, viewportHeight);
  if (presetId === "watch") return resizeWatchPresetForViewport(layoutItems, viewportHeight);
  return layoutItems;
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
  settings: {
    binMs: 500,
    background: "raid_durability",
    annotations: ["player_deaths"],
  },
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
    // Picture first, people second, numbers last and small.
    id: "watch",
    label: "Watch",
    kind: "panels",
    seamless: true,
    fit: true,
    layoutItems: [
      // Full width until the Sidekick strip takes the right three columns.
      { id: "strip-1", title: "Replay", kind: "strip", stripType: "replay", orientation: "horizontal", x: 0, y: 0, w: 12, h: 1, minW: 6, minH: 1, maxH: 2 },
      { id: "panel-1", title: "Map", x: 0, y: 1, w: 8, h: 9, minW: 6 },
      { id: "panel-2", title: "Party", x: 8, y: 1, w: 4, h: 3, minW: 3 },
      { id: "panel-3", title: "Deaths", x: 8, y: 4, w: 4, h: 4, minW: 3 },
      { id: "panel-4", title: "Damage", x: 8, y: 8, w: 4, h: 2, minW: 3 },
    ],
    mobileVariant: {
      fit: false,
      layoutItems: [
        { id: "panel-1", title: "Map", x: 0, y: 0, w: 12, h: 4, minW: 4 },
        { id: "strip-1", title: "Replay", kind: "strip", stripType: "replay", orientation: "horizontal", x: 0, y: 4, w: 12, h: 1, minW: 6, minH: 1, maxH: 2 },
        { id: "panel-2", title: "Party", x: 0, y: 5, w: 12, h: 2, minW: 4 },
        { id: "panel-3", title: "Deaths", x: 0, y: 7, w: 12, h: 3, minW: 4 },
      ],
    },
    panelTypes: {
      "panel-1": "map",
      "panel-2": "raid_frames",
      "panel-3": "deaths",
      "panel-4": "damage_done",
    },
    panelOptions: {
      "panel-1": WATCH_MAP_PANEL_OPTION,
      "panel-3": COMPACT_DEATHS_PANEL_OPTION,
      "panel-4": `g:merged,p:owner,${METER_BARS_PANEL_OPTION}`,
    },
    panelFilters: {
      "panel-4": [DAMAGE_TIME_RANGE_FILTER, DAMAGE_TARGET_ENEMIES_FILTER],
    },
    requiredCapabilities: ["unit-position"],
  },
  {
    id: "summary",
    label: "Summary",
    kind: "panels",
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
    capabilityVariant: {
      requiredCapabilities: [POSITION_SUMMARY_CAPABILITY],
      desktopOnly: true,
      layoutItems: POSITION_SUMMARY_LAYOUT_ITEMS,
      panelTypes: POSITION_SUMMARY_PANEL_TYPES,
      panelOptions: {},
    },
  },
  {
    id: "damage",
    label: "Damage",
    kind: "panels",
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
    kind: "panels",
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
    kind: "panels",
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
    kind: "panels",
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
    requiredCapabilities: ["interrupt"],
  },
  {
    id: "deaths",
    label: "Deaths",
    kind: "panels",
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
    id: "player_timeline",
    label: "Player Timeline",
    kind: "panels",
    seamless: true,
    layoutItems: [
      {
        id: "group-1",
        title: "Panels",
        description: "Pick any panel for each slot.",
        kind: "group",
        collapsedByDefault: true,
        x: 0,
        y: 0,
        w: 12,
        h: 6,
        minW: 12,
        maxW: 12,
      },
      { id: "panel-1", title: "Damage Done", groupId: "group-1", x: 0, y: 0, w: 6, h: 5, minW: 4 },
      { id: "panel-2", title: "Healing Done", groupId: "group-1", x: 6, y: 0, w: 6, h: 5, minW: 4 },
      { id: "panel-3", title: "Player Timeline", x: 0, y: 6, w: 12, h: 1, minW: 12, maxW: 12, minH: 1, maxH: 1 },
    ],
    panelTypes: {
      "panel-1": "damage_done",
      "panel-2": "healing_done",
      "panel-3": "player_timeline",
    },
    panelOptions: {},
    panelFilters: {},
  },
  {
    id: "map",
    label: "Map",
    kind: "panels",
    seamless: true,
    fit: true,
    layoutItems: [
      { id: "strip-1", title: "Replay", kind: "strip", stripType: "replay", orientation: "horizontal", x: 0, y: 0, w: 12, h: 1, minW: 6, minH: 1, maxH: 2 },
      { id: "panel-1", title: "Map", x: 0, y: 1, w: 12, h: 9, minW: 4 },
    ],
    mobileVariant: {
      fit: false,
      layoutItems: [
        { id: "panel-1", title: "Map", x: 0, y: 0, w: 12, h: 4, minW: 4 },
        { id: "strip-1", title: "Replay", kind: "strip", stripType: "replay", orientation: "horizontal", x: 0, y: 4, w: 12, h: 1, minW: 6, minH: 1, maxH: 2 },
      ],
    },
    panelTypes: {
      "panel-1": "map",
    },
    panelOptions: {},
    panelFilters: {},
    requiredCapabilities: ["unit-position"],
  },
  {
    id: "loot",
    label: "Loot",
    kind: "panels",
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
    kind: "panels",
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

function hasCapabilities(required: readonly string[] | undefined, capabilities: readonly string[]): boolean {
  return (required ?? []).every((capability) => capabilities.includes(capability));
}

/** The preset as a log with these capabilities sees it: its capability variant applied when it qualifies. */
export function resolvePresetLayout(preset: PresetLayout, capabilities: readonly string[], mobile = false): PresetLayout {
  if (!isPanelPresetLayout(preset)) return preset;
  let resolved = preset;
  if (mobile && preset.mobileVariant) {
    resolved = {
      ...resolved,
      layoutItems: preset.mobileVariant.layoutItems,
      fit: preset.mobileVariant.fit ?? resolved.fit,
    };
  }
  const variant = preset.capabilityVariant;
  if (!variant || !hasCapabilities(variant.requiredCapabilities, capabilities) || (variant.desktopOnly && mobile)) return resolved;
  return {
    ...resolved,
    layoutItems: variant.layoutItems,
    panelTypes: variant.panelTypes,
    panelOptions: { ...resolved.panelOptions, ...variant.panelOptions },
  };
}

export function getAvailablePresetLayouts(capabilities: readonly string[], mobile = false): PresetLayout[] {
  return PRESET_LAYOUTS
    .filter((preset) => hasCapabilities(preset.requiredCapabilities, capabilities))
    .map((preset) => resolvePresetLayout(preset, capabilities, mobile));
}

export const PRESET_LAYOUTS_BY_ID = Object.fromEntries(
  PRESET_LAYOUTS.map((p) => [p.id, p]),
) as Record<string, PresetLayout>;

/** A preset by id, resolved for the log's capabilities (use this to apply a preset). */
export function presetLayoutById(presetId: string, capabilities: readonly string[], mobile = false): PresetLayout | undefined {
  const preset = PRESET_LAYOUTS_BY_ID[presetId];
  return preset ? resolvePresetLayout(preset, capabilities, mobile) : undefined;
}

export const DEFAULT_PRESET_ID = "summary";
