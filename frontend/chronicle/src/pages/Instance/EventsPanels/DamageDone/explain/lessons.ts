/**
 * The Damage Done lesson roster. Copy and states adapt to the user's live
 * data via DamageDoneCapabilities; videos are wired per-lesson as Remotion
 * compositions land (absent video = text-only lesson).
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
    "Toggle 'Per second' above the chart. Totals reward time spent alive; per-second rewards throughput.",
  bullets: [
    "Totals reward time spent alive; per-second rewards throughput",
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
  description: () =>
    "Colored pills score each player against everyone else who fought this boss with the same spec.",
  deriveState: () => "example-required",
  exampleOnly: true,
  instruction:
    "Grey and white are below average, green and blue are solid, purple and orange are strong, gold is a rank-1 parse. Hover a pill for the cohort.",
  bullets: [
    "Pills appear next to each player once parses are available",
    "Each pill scores against same-spec kills of this boss",
    "Grey and white are below average; green and blue solid; purple and orange strong; gold is rank-1",
  ],
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
    durationInFrames: 240,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

// ── Deeper analysis ──

const abilitiesTargets: L = {
  id: "abilities-targets",
  title: "Compare abilities and targets",
  group: "deeper",
  description: (caps) => {
    if (caps.hasAbilityBreakout && caps.hasTargetBreakout)
      return "By Ability answers what they pressed; By Target answers where it landed.";
    if (caps.hasAbilityBreakout || caps.hasTargetBreakout)
      return "Only one of the two breakdowns exists in your selection.";
    return "Needs breakout data to demonstrate.";
  },
  deriveState: (caps) => {
    if (caps.hasAbilityBreakout && caps.hasTargetBreakout) return "available";
    if (caps.hasAbilityBreakout || caps.hasTargetBreakout) return "limited";
    return "example-required";
  },
  instruction:
    "Inside a breakout, switch between the By Ability and By Target tabs — on fights with adds, By Target is how you spot damage going to the wrong mob.",
};

const combatResults: L = {
  id: "combat-results",
  title: "Inspect detailed combat results",
  group: "deeper",
  description: (caps) => {
    if (caps.hasDetailedStats) return "Hits, crits, and miss types with min/avg/max per ability.";
    if (caps.hasAbilityBreakout) return "Your data has counts but no detailed hit-type stats.";
    return "Needs breakout data to demonstrate.";
  },
  deriveState: (caps) => {
    if (caps.hasDetailedStats) return "available";
    if (caps.hasAbilityBreakout) return "limited";
    return "example-required";
  },
  instruction:
    "Expand an ability inside a breakout with 'More detail' — a wide min-to-max spread usually means partial resists or armor differences.",
};

const spellRanks: L = {
  id: "spell-ranks",
  title: "Separate abilities by spell rank",
  group: "deeper",
  description: (caps) => {
    if (caps.hasSpellRanks) return "Casters in your raid used more than one rank of the same spell.";
    if (caps.hasAbilityBreakout) return "No multi-rank casts in your selection.";
    return "Needs breakout data to demonstrate.";
  },
  deriveState: (caps) => {
    if (caps.hasSpellRanks) return "available";
    if (caps.hasAbilityBreakout) return "limited";
    return "example-required";
  },
  instruction:
    "Toggle 'Ranks' — abilities split by spell ID, so a downranked cast (or a rank you never trained) stands out immediately.",
};

const focusPlayer: L = {
  id: "focus-player",
  title: "Focus on one player",
  group: "deeper",
  description: (caps) =>
    caps.hasFocusTarget && caps.hasAbilityBreakout
      ? "Expand one player's abilities into the whole panel, then step back out."
      : "Needs at least two players with breakout data.",
  deriveState: (caps) => {
    if (caps.hasFocusTarget && caps.hasAbilityBreakout) return "available";
    if (caps.hasFocusTarget) return "limited";
    return "example-required";
  },
  instruction:
    "Ctrl+click (Cmd+click on Mac) a player row and choose Focus — the whole panel switches to that player's abilities. Your filters and selection are kept.",
};

// ── More topics ──

const filters: L = {
  id: "filters",
  title: "Filter the panel",
  group: "more",
  description: () => "Narrow to a spell school, a role, or a single group.",
  deriveState: (caps) => (caps.hasMultiplePlayers ? "available" : "limited"),
  instruction:
    "Filters narrow the rows without touching your encounter selection — filtered totals recalculate so percentages always describe what you see.",
};

const multiEncounter: L = {
  id: "multi-encounter",
  title: "Combine multiple encounters",
  group: "more",
  description: (caps) =>
    caps.hasMultipleEncounters
      ? "Multi-select encounters to sum damage across pulls."
      : "Only one encounter is selected, so there is nothing to aggregate.",
  deriveState: (caps) => (caps.hasMultipleEncounters ? "available" : "example-required"),
  instruction:
    "Ctrl/Cmd+click encounters in the sidebar — totals are additive and duration is the sum of the pulls, which is why per-second values drop slightly.",
};

const pets: L = {
  id: "pets",
  title: "Group pets with their owner",
  group: "more",
  description: (caps) =>
    caps.hasPets
      ? "Pets in your raid contribute damage under their owner."
      : "No pet damage in your selection.",
  deriveState: (caps) => (caps.hasPets ? "available" : "example-required"),
  instruction:
    "Pet damage is attributed to the owner and appears inside their breakout labelled with the pet's name.",
};

const enemyGrouping: L = {
  id: "enemy-grouping",
  title: "Group enemies by name",
  group: "more",
  description: () => "Merge identically named mobs into one readable row.",
  deriveState: (caps) => (caps.hasTargetBreakout ? "available" : "limited"),
  instruction:
    "On a trash pull, enemy grouping collapses forty adds into a single line — toggle it from the panel's grouping options.",
};

const footerDiagnostics: L = {
  id: "footer-diagnostics",
  title: "Read the footer diagnostics",
  group: "more",
  description: () => "Event counts and processing time show how much log this panel chewed through.",
  deriveState: () => "available",
  instruction:
    "The footer reports events processed and render cost — sudden jumps usually mean a much larger selection, and it's a quick sanity check that the selection is what you expected.",
};

export const DAMAGE_DONE_LESSONS: L[] = [
  readChart,
  totalVsDps,
  parseScores,
  pinBreakout,
  abilitiesTargets,
  combatResults,
  spellRanks,
  focusPlayer,
  filters,
  multiEncounter,
  pets,
  enemyGrouping,
  footerDiagnostics,
];
