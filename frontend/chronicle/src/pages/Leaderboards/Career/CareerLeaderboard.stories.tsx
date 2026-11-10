import { useState } from "react"
import { http, HttpResponse } from "msw"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { MemoryRouter } from "react-router-dom"
import type { CareerLeaderboardEntry, CareerLeaderboardRaid, CareerLeaderboardResponse } from "@/api/typesGenerated"
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip"
import type { RatingView } from "../Ratings/ratingThemes"
import { CareerLeaderboard } from "./CareerLeaderboard"
import type { CareerBoardsState, CareerFilters } from "./careerLeaderboardModel"

// Illustrative characters, guilds, and values; not live rankings.
const RAIDS: [string, number, number][] = [
  ["Naxxramas", 6, 4], ["Temple of Ahn'Qiraj", 5, 9], ["Blackwing Lair", 4, 9], ["Molten Core", 3, 10], ["Zul'Gurub", 2, 10], ["Onyxia's Lair", 1, 1],
]
function raids(mastery: number, peak: number, seed: number): CareerLeaderboardRaid[] {
  return RAIDS.map(([instance_name, weight, bosses], i) => {
    const killed = i === 0 && seed % 3 === 0 ? 0 : Math.max(1, bosses - ((seed + i) % 3))
    const scale = killed === 0 ? 0 : 0.8 + ((seed * 7 + i * 13) % 40) / 100
    return {
      instance_name, difficulty_name: "", max_players: 0, weight,
      mastery: Math.min(100, mastery * scale), peak: Math.min(100, peak * scale), kills: killed * 3,
      form: Math.min(100, (mastery - 4) * scale), floor: Math.min(100, (mastery - 14) * scale),
      bosses: Array.from({ length: bosses }, (_, b) => ({ encounter_name: `${instance_name} boss ${b + 1}`, count: b < killed ? 1 + ((seed + b) % 4) : 0 })),
    }
  })
}

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
]

function character([name, cls, spec, guild, mastery, peak, renown]: (typeof ROSTER)[number], i: number): CareerLeaderboardEntry {
  const r = raids(mastery, peak, i)
  return {
    subject_id: `0x${(i + 1).toString(16).padStart(16, "0")}`, name, realm_id: "00000000-0000-0000-0000-000000000001", realm_name: "Nordanaar",
    player_class: cls, player_spec: spec, player_sub_spec: "", guild_name: guild, logo_url: "",
    chosen_metric: spec === "Holy" ? "hps" : "dps", mastery, peak, renown,
    form: mastery - 4, floor: mastery - 14, raids: r,
  }
}

function guild(name: string, mastery: number, peak: number, renown: number, i: number): CareerLeaderboardEntry {
  const r = raids(mastery, peak, i)
  return {
    subject_id: `00000000-0000-0000-0000-00000000010${i}`, name, realm_id: "00000000-0000-0000-0000-000000000001", realm_name: "Nordanaar",
    player_class: "", player_spec: "", player_sub_spec: "", guild_name: "", logo_url: "", chosen_metric: "kill_time",
    mastery, peak, renown, form: mastery - 5, floor: mastery - 12, raids: r,
  }
}

function response(entries: CareerLeaderboardEntry[], total: number): CareerLeaderboardResponse {
  const sortBy = (key: "mastery" | "peak" | "renown") => [...entries].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
  return { status: "ready", mastery: { total, entries: sortBy("mastery") }, peak: { total, entries: sortBy("peak") }, renown: { total: total * 2, entries: sortBy("renown") } }
}

const characters = response(ROSTER.map(character), 1840)
const guilds = response([
  guild("No Quarter", 72.4, 88.1, 9120, 0), guild("Moonlit Vanguard", 66.0, 81.3, 7740, 1),
  guild("Ashen Court", 58.9, 77.0, 5310, 2), guild("Zug Zug", 51.2, 69.8, 6005, 3),
], 120)

function Harness({ initialView = "overview", initialFilters = { subject: "characters", role: "all", scope: {} }, state: fixed }: {
  initialView?: RatingView
  initialFilters?: CareerFilters
  state?: CareerBoardsState
}) {
  const [view, setView] = useState<RatingView>(initialView)
  const [filters, setFilters] = useState<CareerFilters>(initialFilters)
  const [realm, setRealm] = useState("All realms")
  const state = fixed ?? { status: "ready", data: filters.subject === "guilds" ? guilds : characters }
  return (
    <CareerLeaderboard view={view} onView={setView} filters={filters} onFilters={setFilters}
      realm={realm} realms={["All realms", "Nordanaar", "Tel'Abim"]} onRealm={setRealm} state={state}
      request={new URLSearchParams({ subject: filters.subject })} allHref="/leaderboards" />
  )
}

/** The career endpoint over the fixtures: subject, search, offset, and limit. */
const careerHandler = http.get("/api/v1/leaderboards-v2/career", ({ request }) => {
  const url = new URL(request.url)
  const source = url.searchParams.get("subject") === "guilds" ? guilds : characters
  const search = url.searchParams.get("search")?.toLowerCase() ?? ""
  const offset = Number(url.searchParams.get("offset") ?? 0)
  const limit = Number(url.searchParams.get("limit") ?? 100)
  const board = (key: "mastery" | "peak" | "renown") => {
    const matches = source[key].entries.filter((e) => e.name.toLowerCase().includes(search))
    return { total: search ? matches.length : source[key].total, entries: matches.slice(offset, offset + limit) }
  }
  return HttpResponse.json({ status: source.status, mastery: board("mastery"), peak: board("peak"), renown: board("renown") })
})

const meta = {
  title: "pages/Leaderboards/Career",
  component: Harness,
  decorators: [(Story) => <MemoryRouter><TooltipProvider><Story /></TooltipProvider></MemoryRouter>],
  parameters: { layout: "fullscreen", msw: { handlers: [careerHandler] } },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {}

export const Mastery: Story = {
  args: { initialView: "mastery" },
  play: async ({ canvas }) => {
    // The hub's own Mastery columns.
    for (const column of ["Peak", "Form", "Floor", "3-kill progress"]) await expect(await canvas.findByRole("columnheader", { name: new RegExp(`^${column}`) })).toBeInTheDocument()
  },
}

export const Peak: Story = {
  args: { initialView: "peak" },
  play: async ({ canvas }) => {
    // The hub's Peak bars and breakdown dialog, worded for weighted raids.
    await userEvent.click((await canvas.findAllByRole("button", { name: "Raid peaks for Kelthis" }))[0])
    await expect(await within(document.body).findByText(/weighted average of all 6 raids/)).toBeInTheDocument()
  },
}

export const Guilds: Story = {
  args: { initialFilters: { subject: "guilds", role: "all", scope: {} } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("No Quarter").length).toBeGreaterThan(0)
    await expect(canvas.queryByRole("group", { name: "Role" })).not.toBeInTheDocument()
  },
}

export const SwitchToGuilds: Story = {
  args: { initialFilters: { subject: "characters", role: "dps", scope: { cls: "WARRIOR" } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Guilds" })[0])
    await expect(canvas.getAllByText("No Quarter").length).toBeGreaterThan(0)
  },
}

export const MasteryUnavailable: Story = {
  name: "Mastery unavailable (weights pending)",
  args: { state: { status: "ready", data: { ...characters, status: "weights_pending", mastery: { total: 0, entries: [] }, peak: { total: 0, entries: [] } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Renown is unaffected/)).toBeInTheDocument()
  },
}

export const Loading: Story = { args: { state: { status: "loading" } } }

export const Failed: Story = { args: { state: { status: "error", error: "Ratings could not be loaded." } } }
