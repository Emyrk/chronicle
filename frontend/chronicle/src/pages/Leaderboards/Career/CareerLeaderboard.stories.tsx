import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent } from "storybook/test"
import { MemoryRouter } from "react-router-dom"
import type { CareerLeaderboardEntry, CareerLeaderboardResponse } from "@/api/typesGenerated"
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip"
import type { RatingView } from "../Ratings/ratingThemes"
import { CareerLeaderboard } from "./CareerLeaderboard"
import type { CareerBoardsState } from "./careerLeaderboardModel"

// Illustrative characters and values; not live rankings.
const ROSTER: [string, string, string, string, number, number, number][] = [
  ["Aeloria", "PRIEST", "Holy", "Moonlit Vanguard", 61.2, 74.8, 812],
  ["Ravenshield", "WARRIOR", "Fury", "No Quarter", 58.7, 79.1, 1204],
  ["Moonbrew", "DRUID", "Feral", "Nightfall", 55.3, 70.2, 640],
  ["Kelthis", "MAGE", "Fire", "Ashen Court", 53.9, 81.5, 455],
  ["Brakka", "SHAMAN", "Enhancement", "Zug Zug", 50.1, 66.4, 990],
  ["Sylvaine", "HUNTER", "Marksmanship", "Skill Issue", 48.0, 65.3, 198],
  ["Thornwick", "ROGUE", "Combat", "No Quarter", 46.6, 72.0, 1530],
  ["Velmora", "WARLOCK", "Destruction", "Ashen Court", 44.2, 69.9, 702],
  ["Galadh", "PALADIN", "Holy", "Moonlit Vanguard", 41.8, 60.3, 1102],
  ["Orrik", "WARRIOR", "Protection", "Zug Zug", 39.5, 58.8, 1388],
  ["Mistral", "MAGE", "Frost", "", 37.0, 62.1, 120],
  ["Hollow", "PRIEST", "Shadow", "Nightfall", 35.4, 55.6, 377],
]

function entry([name, cls, spec, guild, mastery, peak, renown]: (typeof ROSTER)[number], i: number): CareerLeaderboardEntry {
  return {
    realm_id: "00000000-0000-0000-0000-000000000001", realm_name: "Nordanaar",
    player_guid: `0x${(i + 1).toString(16).padStart(16, "0")}`, player_name: name, player_class: cls, guild_name: guild,
    player_spec: spec, player_sub_spec: "", chosen_metric: spec === "Holy" ? "hps" : "dps",
    mastery, peak, renown,
  }
}

const entries = ROSTER.map(entry)
const sortBy = (key: "mastery" | "peak" | "renown") => [...entries].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
const response: CareerLeaderboardResponse = {
  status: "ready",
  mastery: { total: 1840, entries: sortBy("mastery") },
  peak: { total: 1840, entries: sortBy("peak") },
  renown: { total: 4215, entries: sortBy("renown") },
}

function Harness({ state, initialView = "overview" }: { state: CareerBoardsState; initialView?: RatingView }) {
  const [view, setView] = useState<RatingView>(initialView)
  return <CareerLeaderboard view={view} onView={setView} state={state} />
}

const meta = {
  title: "pages/Leaderboards/Career",
  component: Harness,
  decorators: [(Story) => <MemoryRouter><TooltipProvider><Story /></TooltipProvider></MemoryRouter>],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  args: { state: { status: "ready", data: response } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Aeloria").length).toBeGreaterThan(0)
    await userEvent.click(canvas.getByText("All 4,215 →"))
    await expect(canvas.getByText("Showing the top 12 of 4,215.")).toBeInTheDocument()
  },
}

export const MasteryList: Story = {
  args: { state: { status: "ready", data: response }, initialView: "mastery" },
}

export const RenownOnlySite: Story = {
  name: "Mastery unavailable (weights pending)",
  args: {
    state: { status: "ready", data: { ...response, status: "weights_pending", mastery: { total: 0, entries: [] }, peak: { total: 0, entries: [] } } },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Renown is unaffected/)).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: { state: { status: "loading" } },
}

export const Failed: Story = {
  args: { state: { status: "error", error: "Ratings could not be loaded." } },
}
