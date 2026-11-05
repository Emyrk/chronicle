import type { CSSProperties } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { RatingFullList } from "./RatingFullList"
import type { RatingLiveData } from "./ratingLiveData"
import { MOLTEN_CORE_BOSSES } from "./ratingBoards.fixtures"
import { METRIC_THEMES } from "./ratingThemes"

// Per-boss scores for a full Molten Core clear; 0 is a boss with no kill in the period.
function bosses(scores: number[]) {
  return MOLTEN_CORE_BOSSES.map((encounter_name, i) => ({ encounter_name, score: scores[i] ?? 0 }))
}
const mean = (scores: number[]) => scores.reduce((a, b) => a + b, 0) / MOLTEN_CORE_BOSSES.length
const FIRE = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
const FURY = [0, 100, 92.4, 100, 81.7, 100, 74.2, 100, 0, 96.3, 100, 88.8]
const ROGUE = [64.2, 71.9, 0, 58.3, 77.4, 69.1, 0, 0, 52.6, 80.2, 73.5, 61.7]

// Published-page shape, with missed bosses to make the average inspectable.
const live: RatingLiveData = {
  pageKey: "peak-breakdown-story",
  board: () => ({ status: "loading" }),
  loadPage: async () => ({
    rows: [
      {
        rank: 1,
        entry: { id: "1:mage", name: "Firemage", cls: "MAGE", spec: "Fire", subSpec: "", score: mean(FIRE), detail: "Octo" },
        peakComponents: bosses(FIRE),
      },
      {
        rank: 2,
        entry: { id: "1:warrior", name: "Furywar", cls: "WARRIOR", spec: "Fury", subSpec: "", score: mean(FURY), detail: "Octo" },
        peakComponents: bosses(FURY),
      },
      {
        rank: 3,
        entry: { id: "1:rogue", name: "Stabbs", cls: "ROGUE", spec: "Combat", subSpec: "", score: mean(ROGUE), detail: "Octo" },
        peakComponents: bosses(ROGUE),
      },
    ],
    total: 3,
    page: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  }),
}

const meta = {
  title: "Pages/Leaderboards/Peak Breakdown",
  component: RatingFullList,
  parameters: { layout: "fullscreen" },
  // RatingLeaderboard sets the metric accent for the table it hosts.
  decorators: [(Story) => <div style={{ "--metric": METRIC_THEMES.peak.accent } as CSSProperties}><Story /></div>],
  args: {
    scope: {},
    title: "Molten Core",
    period: "180d",
    view: "peak",
    encounterCount: MOLTEN_CORE_BOSSES.length,
    query: "",
    onQuery: () => {},
    live,
  },
} satisfies Meta<typeof RatingFullList>

export default meta
type Story = StoryObj<typeof meta>

export const MultiBossPeak: Story = {}
