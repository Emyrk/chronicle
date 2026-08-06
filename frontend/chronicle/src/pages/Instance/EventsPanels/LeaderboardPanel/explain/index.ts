import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { LeaderboardPanelResult } from "../leaderboard.processor";
import { deriveCapabilities, type LeaderboardCapabilities } from "./capabilities";
import { ExampleLeaderboardPanel } from "./ExampleLeaderboardPanel";
import { LEADERBOARD_LESSONS } from "./lessons";
import { useLeaderboardCapabilities } from "./useLeaderboardCapabilities";

export const leaderboardExplainer: PanelExplainer<
  LeaderboardPanelResult,
  LeaderboardCapabilities
> = {
  summary:
    "Explains whether an instance qualifies for the speedrun leaderboard and shows the proof behind every requirement.",
  tips: [
    "The header shows a duration only after every qualification requirement passes",
    "Green checks passed; crosses show missing or ineligible requirements",
    "Requirements are grouped by category, and ×N means multiple kills are required",
    "Parser and addon versions must meet the minimum versions shown",
    "Level violations list the players preventing qualification",
  ],
  lessonSet: {
    deriveCapabilities,
    lessons: LEADERBOARD_LESSONS,
    useLiveCapabilityExtras: useLeaderboardCapabilities,
    renderExample: () => createElement(ExampleLeaderboardPanel),
  },
};
