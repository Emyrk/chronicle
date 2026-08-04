/**
 * The Healing Done lesson roster. Ids intentionally reuse the generic
 * data-lesson-target tags where the same UI is involved (read-chart on the
 * chart body, total-vs-dps on the Per second toggle, breakout-tour on the
 * breakout tab bar) so hover-linking works without new tags.
 */

import type { Lesson } from "../../../PanelExplainer/types";
import type { HealingDoneCapabilities } from "./capabilities";

type L = Lesson<HealingDoneCapabilities>;

// ── Essentials ──

const readChart: L = {
  id: "read-chart",
  title: "Read the healing chart",
  group: "essentials",
  description: (caps) =>
    caps.hasMultipleHealers
      ? "Bars, overheal tails, and percentages for the healers in your selection."
      : "Bars, overheal tails, and percentages — clearer with more than one healer.",
  deriveState: (caps) => (caps.hasMultipleHealers ? "available" : "limited"),
  instruction:
    "Each bar is one healer: the solid part is effective healing, the pale tail is overheal, and the percentage is their share of the total.",
  bullets: [
    "Each bar is one healer, colored by class — solid is effective healing",
    "The pale tail on a bar is overheal — healing that overflowed",
    "The number is effective healing; the percent is their share of the total",
  ],
  video: {
    load: () => import("./videos/ReadHealingChart.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const healingModes: L = {
  id: "healing-modes",
  title: "Effective, overheal, and total",
  group: "essentials",
  description: (caps) =>
    caps.hasOverheal
      ? "Three views of the same healing — flip to Overheal to rank wasted healing."
      : "No overhealing in this selection — the three views will look identical.",
  deriveState: (caps) => (caps.hasOverheal ? "available" : "limited"),
  instruction:
    "Use the Effective | Overheal | Total toggle above the chart. Overheal re-ranks healers by overflow; Total combines both numbers.",
  bullets: [
    "Effective healing is the default view — overheal stacks on each bar",
    "Overheal re-ranks healers by wasted healing",
    "Total combines effective healing and overheal into one number",
  ],
  video: {
    load: () => import("./videos/HealingModes.video"),
    durationInFrames: 440,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const totalVsHps: L = {
  id: "total-vs-dps",
  title: "Total healing versus HPS",
  group: "essentials",
  description: (caps) =>
    caps.hasDuration
      ? "Toggle Per Second to divide every value by encounter duration."
      : "Needs a selection with a duration to divide by.",
  deriveState: (caps) => {
    if (caps.hasMultipleHealers && caps.hasDuration) return "available";
    if (caps.hasDuration) return "limited";
    return "example-required";
  },
  instruction:
    "Toggle 'Per second' above the chart — HPS is total healing divided by the total duration of the encounters.",
  bullets: [
    "HPS is total healing divided by the total duration of the encounters",
    "Flip 'Per second' in the panel header — same order, new numbers",
  ],
  video: {
    load: () => import("./videos/TotalVsHps.video"),
    durationInFrames: 320,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const healerBreakout: L = {
  id: "breakout-tour",
  title: "Inside a healer's breakout",
  group: "essentials",
  description: (caps) =>
    caps.hasAbilityBreakout && caps.hasTargetBreakout
      ? "Overheal per heal, and the Healed tab for who your healing landed on."
      : "Your selection has no healing breakdown yet.",
  deriveState: (caps) =>
    caps.hasAbilityBreakout && caps.hasTargetBreakout ? "available" : "example-required",
  instruction:
    "Click a healer's row to pin their breakout — every heal shows its overheal share, and the 'Healed' tab breaks the same healing down by target.",
  bullets: [
    "Every heal shows how much of it overflowed as overheal",
    "'Healed' shows who your healing landed on",
    "Per-target overheal reveals who soaks it",
  ],
  video: {
    load: () => import("./videos/HealerBreakout.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const HEALING_DONE_LESSONS: L[] = [
  readChart,
  healingModes,
  totalVsHps,
  healerBreakout,
];
