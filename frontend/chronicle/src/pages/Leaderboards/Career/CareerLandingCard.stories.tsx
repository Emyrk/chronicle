import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { MemoryRouter } from "react-router-dom"
import type { CareerLeaderboardEntry, HubLandingPreview, LeaderboardHighlightSnapshot, RankingsInstanceSummary } from "@/api/typesGenerated"
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip"
import { CareerCard, LeaderboardsHubApp, type CareerCardLeaders } from "../Hub/HubLanding"
import type { HubTab } from "../Hub/hubTabs"
// Real OctoWoW landing data, captured 2026-11-10.
import instances from "./fixtures/landingInstances.json"
import highlights from "./fixtures/landingHighlights.json"

// Career leaders: real OctoWoW characters and guild, illustrative career values
// (the career endpoint was not deployed when this was captured).
function leader(name: string, guid: string, cls: string, spec: string, values: Partial<CareerLeaderboardEntry>): CareerLeaderboardEntry {
  return {
    subject_id: guid, name, realm_id: "492debcc-f4bd-4f86-b1e7-d9b921aeda4d", realm_name: "N'Zoth",
    player_class: cls, player_spec: spec, player_sub_spec: "", guild_name: "", logo_url: "",
    chosen_metric: "dps", mastery: null, peak: null, renown: 0, form: null, floor: null, raids: [], ...values,
  }
}
// The weighted raids behind career ratings, heaviest first.
const CAREER_RAIDS = [
  "Naxxramas", "Upper Tower of Karazhan", "Temple of Ahn'Qiraj", "Blackwing Lair", "Molten Core", "Timbermaw Hold",
  "Zul'Gurub", "Ruins of Ahn'Qiraj", "Onyxia's Lair", "Emerald Sanctum", "Lower Tower of Karazhan",
]

const LEADERS: CareerCardLeaders = {
  peak: leader("Terenya", "0x000000003B9C9BA1", "DRUID", "Balance", { peak: 71.4 }),
  mastery: leader("Hungrig", "0x000000003B9C4E27", "WARLOCK", "Destruction", { mastery: 58.2 }),
  renown: leader("Gogus", "0x00000000000002D1", "WARRIOR", "Fury", { renown: 612 }),
  guild: leader("Cleave", "ae97a670-a2b2-4939-8abc-4d02db1b0a59", "", "", { mastery: 64.9 }),
}

function Landing({ initialTab = "overview", career = true, leaders = LEADERS }: { initialTab?: HubTab; career?: boolean; leaders?: CareerCardLeaders }) {
  const [tab, setTab] = useState<HubTab>(initialTab)
  return (
    <LeaderboardsHubApp
      tab={tab}
      onTab={setTab}
      realms={["All realms"]}
      instances={instances as RankingsInstanceSummary[]}
      landingPreviews={highlights.landing_previews as unknown as HubLandingPreview[]}
      landingSnapshots={highlights.snapshots as unknown as LeaderboardHighlightSnapshot[]}
      instanceHref={(name) => `/leaderboards/${name}`}
      leadCard={career ? (t) => (t === "overview" || t === "ratings") && <CareerCard to="/leaderboards/career" tab={t} leaders={leaders} raids={CAREER_RAIDS} /> : undefined}
    />
  )
}

const meta = {
  title: "pages/Leaderboards/Career/Landing card",
  component: Landing,
  decorators: [(Story) => <MemoryRouter><TooltipProvider><Story /></TooltipProvider></MemoryRouter>],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Landing>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  play: async ({ canvas }) => {
    const card = canvas.getByRole("link", { name: /Every raid\s*Career/ })
    await expect(card).toHaveAttribute("href", "/leaderboards/career")
    // It is the first card in the grid.
    await expect(card.parentElement?.firstElementChild).toBe(card)
    await expect(within(card).getByText("Terenya")).toBeInTheDocument()
  },
}

export const Ratings: Story = { args: { initialTab: "ratings" } }

export const Calculating: Story = { name: "No career data yet", args: { leaders: undefined } }

export const WithoutCareerCard: Story = { name: "Today (no career card)", args: { career: false } }
