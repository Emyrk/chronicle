/**
 * The Damage Done lesson roster. Copy and states adapt to the user's live
 * data via DamageDoneCapabilities; every lesson is backed by a Remotion video.
 */

import type { Lesson } from "../../../PanelExplainer/types";
import type { DamageDoneCapabilities } from "./capabilities";

type L = Lesson<DamageDoneCapabilities>;

// ── Essentials ──

const readChart: L = {
  id: "read-chart",
  title: "Read the damage chart",
  group: "essentials",
  description: (caps) =>
    caps.hasMultiplePlayers
      ? "Bars, ranks, and percentages for the players in your selection."
      : "Bars, ranks, and percentages — clearer with more than one player.",
  deriveState: (caps) => (caps.hasMultiplePlayers ? "available" : "limited"),
  instruction:
    "Each bar is one player: length is their share of raid damage, the number is the value, and the percentage is their contribution to the total.",
  bullets: [
    "Each bar is one player, colored by class — longer bar, larger share",
    "The number is the value; the percent is their share of the total",
    "Rows are ranked — #1 is your top damage source",
  ],
  video: {
    load: () => import("./videos/ReadChart.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const totalVsDps: L = {
  id: "total-vs-dps",
  title: "Total damage versus DPS",
  group: "essentials",
  description: (caps) =>
    caps.hasDuration
      ? "Toggle Per Second to divide every value by encounter duration."
      : "Needs a selection with a duration to divide by.",
  deriveState: (caps) => {
    if (caps.hasMultiplePlayers && caps.hasDuration) return "available";
    if (caps.hasDuration) return "limited";
    return "example-required";
  },
  instruction:
    "Toggle 'Per second' above the chart — DPS is total damage divided by the total duration of the encounters.",
  bullets: [
    "DPS is total damage divided by the total duration of the encounters",
    "Flip 'Per second' in the panel header — same order, new numbers",
  ],
  video: {
    load: () => import("./videos/TotalVsDps.video"),
    durationInFrames: 320,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const parseScores: L = {
  id: "parse-scores",
  title: "Understand parse scores",
  group: "essentials",
  description: (caps) =>
    caps.hasParses
      ? "Colored pills score each player against everyone else who fought this boss with the same spec."
      : "No parse data for this selection yet.",
  deriveState: (caps) => (caps.hasParses ? "available" : "example-required"),
  instruction:
    "The scale climbs grey, green, blue, purple, orange, then pink at 99 — gold is a perfect 100. Hover a pill for the cohort.",
  bullets: [
    "Pills appear next to each player once parses are available",
    "Each pill scores against same-spec kills of this boss",
    "The scale climbs grey → green → blue → purple → orange → pink; gold is a perfect 100",
    "No pill means there isn't enough data for that spec yet",
  ],
  learnMore: { href: "/parsing", label: "Read more about how parses work" },
  video: {
    load: () => import("./videos/ParseScores.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const pinBreakout: L = {
  id: "pin-breakout",
  title: "Open and pin a player breakout",
  group: "essentials",
  description: (caps) =>
    caps.hasAbilityBreakout
      ? "Every row in your selection has ability detail to expand."
      : "Your selection has no ability breakdown yet.",
  deriveState: (caps) => (caps.hasAbilityBreakout ? "available" : "example-required"),
  instruction:
    "Click a player row to open their breakout, pin it to keep it open, then open a second player to compare rotations side by side.",
  bullets: [
    "Click a player row to pin its ability breakout",
    "Pinned breakouts stay open and are draggable",
    "Open a second player to compare rotations side by side",
  ],
  video: {
    load: () => import("./videos/PinBreakout.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const breakoutTour: L = {
  id: "breakout-tour",
  title: "Tour the breakout panel",
  group: "essentials",
  description: (caps) =>
    caps.hasDetailedStats && caps.hasTargetBreakout
      ? "More detail, min/avg/max, and the By Target tab inside a breakout."
      : "Your selection is missing detailed hit stats.",
  deriveState: (caps) =>
    caps.hasAbilityBreakout && caps.hasTargetBreakout && caps.hasDetailedStats
      ? "available"
      : "example-required",
  instruction:
    "Open a breakout, click 'More detail' to expand the hit types, flip the ↕ toggle for min/avg/max, then switch to 'By Target' to see where the damage went.",
  bullets: [
    "'More detail' expands every hit type — hits, crits, misses, dodges, and more",
    "The ↕ toggle shows min / avg / max damage per hit type",
    "'By Target' breaks the same damage down by who it hit",
  ],
  video: {
    load: () => import("./videos/BreakoutTour.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const spellRanks: L = {
  id: "spell-ranks",
  title: "Split abilities by rank",
  group: "essentials",
  description: (caps) =>
    caps.hasSpellRanks
      ? "Your log has spells cast at more than one rank to split out."
      : "No multi-rank spells in this selection.",
  deriveState: (caps) =>
    caps.hasSpellRanks && caps.hasAbilityBreakout ? "available" : "example-required",
  instruction:
    "Flip the 'Ranks' toggle above the chart — ability breakouts split each spell into the ranks it was cast at, so downranking shows up as separate rows.",
  bullets: [
    "With Ranks off, every rank of a spell merges into one row",
    "'Ranks' splits each spell by cast rank, with the rank as a subtitle",
    "Spot downranking at a glance",
  ],
  video: {
    load: () => import("./videos/SpellRanks.video"),
    durationInFrames: 380,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const filters: L = {
  id: "filters",
  title: "Filter what a panel counts",
  group: "essentials",
  description: () =>
    "Narrow any panel by ability, school, hit type, source, target, or time range.",
  deriveState: () => "available",
  instruction:
    "Click the filter icon in the panel header, choose 'Edit filters', and add a filter — the chart updates live and the icon turns green while filters are active.",
  bullets: [
    "The filter icon in the panel header opens the filter menu",
    "Filter by ability, school, hit type, source, target, or time range",
    "Filters apply live — the icon turns green while they're active",
  ],
  video: {
    load: () => import("./videos/Filters.video"),
    durationInFrames: 500,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const compareAbilities: L = {
  id: "compare-abilities",
  title: "Compare two players' abilities",
  group: "essentials",
  description: (caps) =>
    caps.hasFocusTarget
      ? "Shared hover and selection across breakouts — compare rotations head to head."
      : "Needs at least two players with breakout data.",
  deriveState: (caps) =>
    caps.hasAbilityBreakout && caps.hasFocusTarget ? "available" : "example-required",
  instruction:
    "Pin two players of the same class, hover an ability to highlight it in every open breakout, and click rows to select them — each footer totals exactly the selected abilities.",
  bullets: [
    "Pin two players of the same class side by side",
    "Hovering an ability row highlights it in every open breakout",
    "Click rows to select — footers total exactly those abilities",
  ],
  video: {
    load: () => import("./videos/CompareAbilities.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const DAMAGE_DONE_LESSONS: L[] = [
  readChart,
  totalVsDps,
  parseScores,
  pinBreakout,
  breakoutTour,
  compareAbilities,
  spellRanks,
  filters,
];
