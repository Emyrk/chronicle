/**
 * The Death Log lesson roster.
 */

import type { Lesson } from "../../../PanelExplainer/types";
import type { DeathLogCapabilities } from "./capabilities";

type L = Lesson<DeathLogCapabilities>;

// ── Essentials ──

const readLog: L = {
  id: "read-log",
  title: "Read the death log",
  group: "essentials",
  description: (caps) =>
    caps.hasDeaths
      ? "Every death in order — timestamps, killers, and encounter links."
      : "Every death in order — nobody died in this selection (nice).",
  deriveState: (caps) => (caps.hasDeaths ? "available" : "limited"),
  instruction:
    "Each row is one death: flip 'Encounter offset' for fight-relative times, hover 'Killed By' for the killing blow's ability, amount, school, and crits, and click an encounter to select that pull.",
  bullets: [
    "Flip 'Encounter offset' to see fight time instead of wall-clock time",
    "Hover 'Killed By' for the killing blow — ability, amount, school, crits",
    "Encounter links select that pull across the whole page",
  ],
  video: {
    load: () => import("./videos/ReadDeathLog.video"),
    durationInFrames: 410,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const deathRecap: L = {
  id: "death-recap",
  title: "Expand a death recap",
  group: "essentials",
  description: (caps) =>
    caps.hasRecaps
      ? "Click a death for its last ten seconds — every hit, heal, and absorb."
      : "Click a death for its last ten seconds of incoming events.",
  deriveState: (caps) => (caps.hasRecaps ? "available" : "limited"),
  instruction:
    "Click any death row to expand its recap: the last ten seconds of incoming events, newest first, with the killing blow at the top and the heals that almost saved them.",
  bullets: [
    "Click a death row to expand its recap inline",
    "The last ten seconds of incoming events, newest first",
    "Heals and absorbs show what the healers managed",
  ],
  video: {
    load: () => import("./videos/DeathRecapExpand.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const floatingRecap: L = {
  id: "floating-recap",
  title: "The floating death recap",
  group: "essentials",
  description: () =>
    "A draggable recap window with a scrubbable timeline and health bar.",
  deriveState: (caps) => (caps.hasRecaps ? "available" : "limited"),
  instruction:
    "The \u2197 button opens a floating recap you can drag anywhere \u2014 open several to compare deaths. Hovering the event list scrubs a shared fight cursor, and the health bar replays the final seconds.",
  bullets: [
    "The \u2197 button opens a floating, draggable recap window",
    "Open several to compare deaths side by side",
    "The rail on the right previews the whole timeline",
    "Scrubbing the list replays the health bar through the death",
  ],
  video: {
    load: () => import("./videos/FloatingRecap.video"),
    durationInFrames: 620,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

// ── Advanced ──

const healthBar: L = {
  id: "health-bar",
  title: "Anatomy of the health bar",
  group: "advanced",
  description: () =>
    "A labeled tour of the relative health bar \u2014 pills, stripes, and markers.",
  deriveState: () => "available",
  instruction:
    "Classic logs never record absolute HP, so the bar tracks NET change from a relative zero: the white marker is the current position, the bright pill is the latest event, stripes are absorbed damage or overheal, and the endcaps mark the lowest and highest points seen.",
  bullets: [
    "Logs never record absolute HP \u2014 the bar tracks net change from zero",
    "White marker: current position; red fill left of zero: deficit",
    "The bright pill is the latest event; stripes are absorbs and overheal",
    "Endcaps mark the lowest and highest points seen",
  ],
  video: {
    load: () => import("./videos/HealthBarAnatomy.video"),
    durationInFrames: 530,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const DEATH_LOG_LESSONS: L[] = [
  // Essentials
  readLog,
  deathRecap,
  floatingRecap,
  // Advanced
  healthBar,
];
