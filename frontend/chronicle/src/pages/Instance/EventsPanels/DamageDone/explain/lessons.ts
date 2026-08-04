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
    durationInFrames: 300,
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
    durationInFrames: 270,
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
      : "No parse data for this selection yet — learn on the example raid.",
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
    durationInFrames: 300,
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
    durationInFrames: 420,
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
];
