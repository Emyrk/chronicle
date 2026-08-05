/**
 * The All Activity lesson roster.
 */

import type { Lesson } from "../../../PanelExplainer/types";
import type { AllActivityCapabilities } from "./capabilities";

type L = Lesson<AllActivityCapabilities>;

// ── Essentials ──

const streams: L = {
  id: "streams",
  title: "Choose your event streams",
  group: "essentials",
  description: () => "Every chip is one stream of raw events — click to show or hide it.",
  deriveState: (caps) => (caps.hasEvents ? "available" : "limited"),
  instruction:
    "Each chip in the Streams row is one kind of raw event with its count. Hover a chip to see what it contains; click to show or hide that stream. Nothing is deleted — disabled streams just grey out.",
  bullets: [
    "Every chip is one stream of raw events, with its count",
    "Hover a chip to see what the stream contains",
    "Click to show or hide it — nothing is deleted",
  ],
  video: {
    load: () => import("./videos/Streams.video"),
    durationInFrames: 520,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const quickFilters: L = {
  id: "quick-filters",
  title: "Quick filters",
  group: "essentials",
  description: () => "Narrow the list by source, ability, or target as you type.",
  deriveState: (caps) => (caps.hasEvents ? "available" : "limited"),
  instruction:
    "The three inputs beside the stream chips filter by source, ability, and target. The list narrows as you type, the filters stack, and the \u00d7 clears one instantly.",
  bullets: [
    "Filter by source, ability, or target",
    "The list narrows as you type — filters stack",
    "The \u00d7 clears a filter instantly",
  ],
  video: {
    load: () => import("./videos/QuickFilters.video"),
    durationInFrames: 530,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const timeFormats: L = {
  id: "time-formats",
  title: "Three ways to read time",
  group: "essentials",
  description: () => "UTC, your local clock, or fight-relative encounter offset.",
  deriveState: () => "available",
  instruction:
    "Combat logs record UTC — the server's clock. Click the Time column header to switch to your local clock, or flip 'Encounter offset' in the panel header for fight-relative +m:ss.s timestamps.",
  bullets: [
    "Logs record UTC — the server's clock, not yours",
    "Click the Time header to switch to your local clock",
    "Flip 'Encounter offset' for fight-relative time",
  ],
  video: {
    load: () => import("./videos/TimeFormats.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

// ── Advanced ──

const filters: L = {
  id: "filters",
  title: "Advanced panel filters",
  group: "advanced",
  description: () => "The full filter editor — ability, source, target, or time range.",
  deriveState: (caps) => (caps.hasEvents ? "available" : "limited"),
  instruction:
    "The header's filter icon opens the full filter editor: add chips for abilities, sources, targets, schools, or a time range. Active filters turn the icon green and apply to everything the panel shows.",
  bullets: [
    "The filter icon opens the full filter editor",
    "Filter by ability, school, source, target, or time range",
    "Active filters turn the icon green",
  ],
  video: {
    load: () => import("./videos/AdvancedFilters.video"),
    durationInFrames: 500,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const ALL_ACTIVITY_LESSONS: L[] = [
  // Essentials
  streams,
  quickFilters,
  timeFormats,
  // Advanced
  filters,
];
