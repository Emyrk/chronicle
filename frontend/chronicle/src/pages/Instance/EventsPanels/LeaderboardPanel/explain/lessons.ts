import type { Lesson } from "../../../PanelExplainer/types";
import type { LeaderboardCapabilities } from "./capabilities";

type LeaderboardLesson = Lesson<LeaderboardCapabilities>;

const readProof: LeaderboardLesson = {
  id: "read-proof",
  title: "Read the speedrun proof",
  group: "essentials",
  description: (caps) =>
    caps.hasProof
      ? "See which required bosses and trash groups this run completed."
      : "Open a supported raid with speedrun proof, or watch the example.",
  deriveState: (caps) => (caps.hasProof ? "available" : "example-required"),
  instruction:
    "Read each category from left to right. Green checks count toward qualification; dim crosses identify missing requirements, and ×N means multiple kills are required.",
  bullets: [
    "Requirements are grouped into categories such as Bosses and Trash",
    "Green checks passed; dim crosses are still missing",
    "A ×N suffix means the run needs that many kills",
  ],
  video: {
    load: () => import("./videos/ReadProof.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const eligibilityChecks: LeaderboardLesson = {
  id: "eligibility-checks",
  title: "Check leaderboard eligibility",
  group: "essentials",
  description: (caps) =>
    caps.hasEligibilityChecks
      ? "Confirm the tooling, data source, and ranking checks for this log."
      : "Eligibility details are unavailable for this log, so the example fills them in.",
  deriveState: (caps) =>
    caps.hasEligibilityChecks ? "available" : "example-required",
  instruction:
    "Check each eligibility row below the proof. Current parser and addon versions are compared with the minimums, while data source and DPS ranking rows confirm the log can support a leaderboard entry.",
  bullets: [
    "Parser and addon versions must meet their configured minimums",
    "The data source must be eligible for trusted speedrun timing",
    "DPS rankings show whether player ranking data was recorded",
  ],
  video: {
    load: () => import("./videos/EligibilityChecks.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const findBlockers: LeaderboardLesson = {
  id: "find-blockers",
  title: "Find qualification blockers",
  group: "advanced",
  description: (caps) =>
    caps.hasBlockers
      ? "This run has one or more failed checks to investigate."
      : caps.hasSpeedrun
        ? "This run qualifies, so use the example to see how blockers appear."
        : "Open a run with speedrun data, or use the example.",
  deriveState: (caps) => {
    if (caps.hasBlockers) return "available";
    if (caps.hasSpeedrun) return "limited";
    return "example-required";
  },
  instruction:
    "Start with the Incomplete counter, then scan for crosses. A failed boss, tooling version, data source, or player level requirement can keep an otherwise fast clear off the leaderboard.",
  bullets: [
    "The header summarizes how many proof requirements passed",
    "Crosses identify the exact failed checks",
    "Level violations name the player and recorded level",
  ],
  video: {
    load: () => import("./videos/FindBlockers.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const LEADERBOARD_LESSONS: LeaderboardLesson[] = [
  readProof,
  eligibilityChecks,
  findBlockers,
];
