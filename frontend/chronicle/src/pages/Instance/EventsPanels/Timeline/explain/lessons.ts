/**
 * The Line Chart (Timeline) lesson roster. Ids reuse generic
 * data-lesson-target tags where the same UI is involved.
 */

import type { Lesson } from "../../../PanelExplainer/types";
import type { TimelineCapabilities } from "./capabilities";

type L = Lesson<TimelineCapabilities>;

// ── Essentials ──

const readChart: L = {
  id: "read-chart",
  title: "Read the line chart",
  group: "essentials",
  description: (caps) =>
    caps.hasData
      ? "Series over fight time, with a tooltip that reads every line at once."
      : "Series over fight time — clearer once your selection has events.",
  deriveState: (caps) => (caps.hasData ? "available" : "limited"),
  instruction:
    "Each line tracks one series across the fight. Hover anywhere to read every series at that second; time runs across the bottom, value up the side.",
  bullets: [
    "Each line is one series — damage by default — bucketed per second",
    "Hover anywhere: the tooltip reads every series at that moment",
    "Time runs across the bottom; value up the side",
  ],
  video: {
    load: () => import("./videos/ReadLineChart.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const timeRange: L = {
  id: "time-range",
  title: "Select a time window",
  group: "essentials",
  description: () =>
    "Drag on the chart to zoom every panel into that slice of the fight.",
  deriveState: () => "available",
  instruction:
    "Click and drag across the chart to select a time window — every panel on the page narrows to it. 'Reset Selection' (or double-click) brings back the whole fight.",
  bullets: [
    "Drag across the chart to select a window of the fight",
    "Every panel on the page narrows to that window",
    "'Reset Selection' or double-click restores the whole fight",
  ],
  video: {
    load: () => import("./videos/TimeRangeSelect.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const legend: L = {
  id: "legend",
  title: "Toggle series from the legend",
  group: "essentials",
  description: () => "Click a legend entry to hide or show its line.",
  deriveState: () => "available",
  instruction:
    "Click a series in the legend to hide its line — the label strikes through. Click again to bring it back.",
  bullets: [
    "Click a legend entry to hide its line",
    "Hidden series show a struck-through label",
    "Click again to bring the line back",
  ],
  video: {
    load: () => import("./videos/LegendToggle.video"),
    durationInFrames: 380,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

// ── Advanced ──

const aggregations: L = {
  id: "aggregations",
  title: "Sum, rolling average, cumulative",
  group: "advanced",
  description: () =>
    "The same data, three shapes — smooth spikes or climb to the fight total.",
  deriveState: () => "available",
  instruction:
    "Each series has an aggregation, set on the panel's back: Sum per bucket, a rolling average that smooths spikes, per-second rates, or a cumulative climb to the total.",
  bullets: [
    "Sum shows the total per one-second bucket — spiky but exact",
    "Rolling average smooths the spikes to show the trend",
    "Cumulative climbs to the fight total",
    "Set per series in the panel's back-side editor",
  ],
  video: {
    load: () => import("./videos/Aggregations.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const editSeries: L = {
  id: "edit-series",
  title: "Build your own series",
  group: "advanced",
  description: () =>
    "Flip the card: add series with their own stream, aggregation, color, and filters.",
  deriveState: () => "available",
  instruction:
    "Open the panel's back-side editor and press + to add a series. Each one picks its own event stream, aggregation, color, and filters — overlay damage against healing, or one ability against another.",
  bullets: [
    "Flip the card and press + to add a series",
    "Each series picks its own stream, aggregation, and color",
    "Per-series filters let you chart a single ability",
  ],
  video: {
    load: () => import("./videos/EditSeries.video"),
    durationInFrames: 530,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const durability: L = {
  id: "durability",
  title: "Raid durability background",
  group: "advanced",
  description: () =>
    "A background that shades how healthy the raid was at every moment.",
  deriveState: () => "available",
  instruction:
    "Set Background to 'Raid Durability' in the panel's back-side settings — bars behind the lines shade from green to red as the raid takes losses. Works with a single selected encounter.",
  bullets: [
    "Background bars estimate raid health at every moment",
    "Green fades to red as players drop",
    "Requires a single selected encounter",
  ],
  video: {
    load: () => import("./videos/RaidDurability.video"),
    durationInFrames: 380,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const TIMELINE_LESSONS: L[] = [
  // Essentials
  readChart,
  timeRange,
  legend,
  // Advanced
  aggregations,
  editSeries,
  durability,
];
