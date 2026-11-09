import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { expect, fireEvent, userEvent, within } from "storybook/test"
import { LeaderboardHub } from "./LeaderboardHub"
import { LeaderboardsHubApp } from "./HubLanding"
import { REALM_KEY } from "./hubRealm"
import supportedInstances from "./supportedInstances.fixture.json"
import { instanceBosses, parseCohort, parseSpreads, timeParseCohort } from "./hub.fixtures"

const meta = {
  title: "Pages/Leaderboards/Hub",
  component: LeaderboardHub,
  parameters: {
    layout: "fullscreen",
    // Rulesets reuse today's views, which read supported-instance rules (dumped from the turtle registry).
    msw: {
      handlers: [
        http.get("/api/v1/raidlogs/supported", () => HttpResponse.json(supportedInstances)),
        // The parsing views fetch their own detail; serve it from the mock fixtures.
        http.get("/api/v1/rankings/parse-score-cohorts/spreads", ({ request }) => {
          const q = new URL(request.url).searchParams
          const metric = q.get("metric") === "hps" ? "hps" : "dps"
          return HttpResponse.json({
            available: true,
            cutoff: "2026-11-02T00:00:00Z",
            lookback_days: 60,
            cohort_mode: "spec",
            metric,
            spreads: parseSpreads(metric, q.getAll("encounter_name"), q.get("class") ?? undefined, q.get("spec") ?? undefined),
          })
        }),
        http.get("/api/v1/rankings/parse-score-cohorts/cohort", ({ request }) => {
          const q = new URL(request.url).searchParams
          const metric = q.get("metric") === "hps" ? "hps" : "dps"
          return HttpResponse.json(
            parseCohort(metric, q.get("encounter_name") ?? "", q.get("class") ?? "", q.get("spec") ?? undefined, q.get("sub_spec") ?? undefined),
          )
        }),
        http.get("/api/v1/rankings/time-parse-cohorts/cohort", ({ request }) => {
          const q = new URL(request.url).searchParams
          const instance = q.get("instance_name") ?? "Molten Core"
          const kind = q.get("kind") === "clear_time" ? "clear_time" : "boss_kill"
          return HttpResponse.json(timeParseCohort(instance, kind, q.get("encounter_name") ?? "", instanceBosses(instance)))
        }),
      ],
    },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof LeaderboardHub>

export default meta
type Story = StoryObj<typeof meta>

/** Raid overview: clear-time podium, ratings/Renown/performance/parse cards, then a card per boss with its model. */
export const RaidOverview: Story = {}

/** The mobile header keeps the current filter summary visible and expands the full controls on demand. */
export const MobileHeader: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const filters = canvas.getByRole("button", { name: /Filters/ })
    await expect(filters).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.getByText("DPS · Characters")).toBeInTheDocument()
    const classes = canvas.getByLabelText("All 9 classes selected")
    await expect(within(classes).getAllByRole("img")).toHaveLength(4)
    await expect(within(classes).getByText("+5")).toBeInTheDocument()
    await userEvent.click(filters)
    await expect(filters).toHaveAttribute("aria-expanded", "true")
    await expect(canvas.getByRole("group", { name: "Class" })).toBeInTheDocument()
    await expect(canvas.getByRole("group", { name: "Role" })).toBeInTheDocument()
    await expect(canvas.getByRole("group", { name: "Rank" })).toBeInTheDocument()
  },
}

/** On phones, encounters open from the same bottom-left floating control used by instance pages. */
export const MobileEncounterDrawer: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(await page.findByRole("button", { name: "Show encounters" }))
    await expect(page.getByRole("dialog", { name: "Encounter selector" })).toBeInTheDocument()
    await expect(page.getByRole("button", { name: "Close encounters" })).toBeInTheDocument()
  },
}

/** Clicking a boss card narrows the page to that boss: kill-time podium, kill stats, the same cards for the boss. */
export const BossOverview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bosses = within(canvas.getByRole("region", { name: "Bosses" }))
    await userEvent.click(bosses.getByRole("button", { name: /Ragnaros/ }))
    await expect(within(await canvas.findByRole("navigation", { name: "Breadcrumb" })).getByText("Ragnaros")).toBeInTheDocument()
    await expect(canvas.getByRole("region", { name: "Ragnaros stats" })).toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: "Bosses" })).not.toBeInTheDocument()
  },
}

/** Boss + class + healing together: Priest healers on Ragnaros, Holy and Discipline cards, HPS everywhere. */
export const PriestHealingOnRagnaros: Story = { args: { initialScope: { boss: "Ragnaros", cls: "PRIEST" }, initialRole: "healing" } }

/** A class swaps guild results for its specs: spec cards up top, where the class stands, class stats on each boss. */
export const WarriorOverview: Story = {
  args: { initialScope: { cls: "WARRIOR" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const specs = within(canvas.getByRole("region", { name: "Specs" }))
    await expect(canvas.getByRole("region", { name: "Where Warrior stands · MC" })).toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: /Guild Renown/ })).not.toBeInTheDocument()
    await expect(canvas.getByRole("region", { name: "Bosses", exact: true })).toBeInTheDocument()
    await userEvent.click(specs.getByRole("button", { name: "Arms" }))
    await expect(within(canvas.getByRole("navigation", { name: "Breadcrumb" })).getByText("Arms")).toBeInTheDocument()
    await expect(canvas.getByRole("region", { name: "Where Arms Warrior stands · MC" })).toBeInTheDocument()
  },
}

/**
 * Every Druid spec in the strip: Feral's Cat and Bear subspecs as specs of their own, Restoration from the
 * healing role. Picking a subspec adds a third picker step; a healing spec brings the role with it.
 */
export const DruidOverview: Story = {
  args: { initialScope: { cls: "DRUID" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const specs = () => within(canvas.getByRole("region", { name: "Specs" }))
    for (const name of ["Feral (Cat)", "Feral (Bear)", "Balance", "Restoration"])
      await expect(specs().getByRole("button", { name })).toBeInTheDocument()
    await userEvent.click(specs().getByRole("button", { name: "Feral (Cat)" }))
    const subs = within(await canvas.findByRole("group", { name: "Feral subspec" }))
    await expect(subs.getByRole("button", { name: "Cat" })).toHaveAttribute("aria-pressed", "true")
    await expect(within(canvas.getByRole("navigation", { name: "Breadcrumb" })).getByText("Cat")).toBeInTheDocument()
    // Another spec drops the subspec; Balance has none to offer.
    await userEvent.click(within(canvas.getByRole("group", { name: "Druid spec" })).getByRole("button", { name: "Balance" }))
    await expect(canvas.queryByRole("group", { name: "Feral subspec" })).not.toBeInTheDocument()
    // Clicking the chosen spec again widens back to every Druid spec.
    await userEvent.click(within(canvas.getByRole("group", { name: "Druid spec" })).getByRole("button", { name: "Balance", pressed: true }))
    await userEvent.click(specs().getByRole("button", { name: "Restoration" }))
    await expect(canvas.getByRole("button", { name: "Healing" })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByRole("region", { name: "Where Restoration Druid stands · MC" })).toBeInTheDocument()
  },
}

/**
 * Guilds mode: the page tints gold, the class filter steps aside, and guild runs are rated like parses
 * (time against the fastest = 100). Ratings, best runs, and typical clear time replace the player cards.
 */
export const RaidGuilds: Story = {
  args: { initialSubject: "guilds" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = within(canvas.getByRole("region", { name: "Guild Ratings · MC" }))
    await expect(card.getByRole("button", { name: "Full Peak board" })).toBeInTheDocument()
    await expect(canvas.getByRole("region", { name: "Best Performances (Clear time) · MC" })).toBeInTheDocument()
    await expect(canvas.getByRole("region", { name: "Typical clear time by guild · MC" })).toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: /Typical DPS parse/ })).not.toBeInTheDocument()
    await expect(canvas.getByRole("group", { name: "Class" }).closest("[aria-disabled]")).not.toBeNull()
    await expect(within(canvas.getByRole("navigation", { name: "Breadcrumb" })).getByText("Guilds")).toBeInTheDocument()
    // The metric link opens the full guild table on the Ratings tab straight away, no boss cards.
    await userEvent.click(card.getByRole("button", { name: "Full Ranked Mastery board" }))
    await expect(await canvas.findByRole("region", { name: "Guild Ranked Mastery · MC full list" })).toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: "Boss boards" })).not.toBeInTheDocument()
  },
}

/**
 * Ratings tab, reached from the overview card's metric link. A single metric (Peak, Mastery, Renown)
 * opens its full table straight away, no boss cards. Overview on all bosses: the board on top and a
 * compact card per boss; a class or spec filter keeps the boss cards. One boss opens its full table.
 * "All N ranked" swaps the overview board for the table (cards stay below); the table sorts, searches,
 * and leads with the ranking's own number.
 */
export const RatingsTab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const crumbs = () => within(canvas.getByRole("navigation", { name: "Breadcrumb" }))
    await userEvent.click(within(canvas.getByRole("region", { name: "Ratings · MC" })).getByRole("button", { name: "Full Peak board" }))
    // The metric switch lives in the board or table header, so look it up fresh after each swap.
    await canvas.findByRole("navigation", { name: "Rating metric" })
    const tabs = () => within(canvas.getByRole("navigation", { name: "Rating metric" }))
    await expect(tabs().getByRole("button", { name: "Peak" })).toHaveAttribute("aria-pressed", "true")
    const peak = within(await canvas.findByRole("region", { name: /Peak full list/ }))
    await expect(peak.queryByRole("button", { name: "Back to boards" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: "By boss" })).not.toBeInTheDocument()

    // Overview keeps the board and a card per boss; a boss card opens that boss: its table, no cards.
    await userEvent.click(tabs().getByRole("button", { name: "Overview" }))
    await expect(await canvas.findByRole("region", { name: "By boss" })).toBeInTheDocument()
    await userEvent.click(within(canvas.getByRole("region", { name: /^Ragnaros .* leaderboard$/ })).getByRole("button", { name: /Ragnaros/ }))
    await expect(crumbs().getByText("Ragnaros")).toBeInTheDocument()
    const boss = within(await canvas.findByRole("region", { name: "Ragnaros Overview full list" }))
    await expect(boss.queryByRole("button", { name: "Back to boards" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: "By boss" })).not.toBeInTheDocument()

    // Back on the full clear, a spec filter keeps a card per boss, each showing that spec's leaders.
    await userEvent.click(within(canvas.getByRole("navigation", { name: "Encounters" })).getByRole("button", { name: "All bosses" }))
    await userEvent.click(within(canvas.getByRole("group", { name: "Class" })).getByRole("button", { name: "Warrior" }))
    await userEvent.click(within(await canvas.findByRole("group", { name: "Warrior spec" })).getByRole("button", { name: "Fury" }))
    await expect(await canvas.findByRole("region", { name: "By boss" })).toBeInTheDocument()
    await expect(canvas.getByRole("region", { name: /^Ragnaros .* leaderboard$/ })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Whole raid" }))

    // "All N ranked" swaps the board for the full table; the boss cards stay below.
    await expect(canvas.queryByRole("region", { name: /full list/ })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: /^All \d+ ranked$/ }))
    await expect(canvas.getByRole("region", { name: "By boss" })).toBeInTheDocument()
    const list = within(await canvas.findByRole("region", { name: /Overview full list/ }))
    // Sort by a score column (the header's metric switch has a "Renown" button too).
    const renownColumn = within(list.getByRole("columnheader", { name: /Renown/ }))
    await userEvent.click(renownColumn.getByRole("button"))
    await expect(renownColumn.getByRole("button")).toHaveAttribute("aria-pressed", "true")
    await userEvent.type(list.getByRole("textbox", { name: "Find character or guild" }), "zzzz")
    await expect(list.getByText("No characters match.")).toBeInTheDocument()
    // A single metric is the table alone: no way back to boards, no boss cards.
    await userEvent.click(tabs().getByRole("button", { name: "Ranked Mastery" }))
    const mastery = within(await canvas.findByRole("region", { name: /Ranked Mastery full list/ }))
    await expect(mastery.queryByRole("button", { name: "Back to boards" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: "By boss" })).not.toBeInTheDocument()
  },
}

/**
 * Zul'Gurub: published boss miniatures render real models on the cards. Optional bosses come last in
 * the encounter list and get their own, visibly secondary group of cards.
 */
export const ZulGurubOverview: Story = {
  args: { instanceName: "Zul'Gurub" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const names = within(canvas.getByRole("navigation", { name: "Encounters" }))
      .getAllByRole("button")
      .map((el) => el.textContent ?? "")
    await expect(names.findIndex((t) => t.includes("Hakkar"))).toBeLessThan(names.findIndex((t) => t.includes("Gahz'ranka")))
    const card = within(within(canvas.getByRole("region", { name: "Optional bosses" })).getByRole("button", { name: /Gahz.ranka/ }))
    await expect(card.getByText("Optional")).toBeInTheDocument()
  },
}

/**
 * The encounter list, as on /leaderboards: every boss is selected on entry (full clears), click picks
 * one boss, Ctrl+Click adds or removes one, and "All bosses" goes back. The column collapses to the left.
 */
export const EncounterSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sidebar = within(canvas.getByRole("navigation", { name: "Encounters" }))
    await expect(sidebar.queryByRole("button", { name: /Full clear/ })).not.toBeInTheDocument()
    await expect(sidebar.getByRole("button", { name: /Ragnaros/ })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByText("Fastest full clears")).toBeInTheDocument()

    await userEvent.click(sidebar.getByRole("button", { name: /Ragnaros/ }))
    await expect(within(canvas.getByRole("navigation", { name: "Breadcrumb" })).getByText("Ragnaros")).toBeInTheDocument()
    await expect(sidebar.getByRole("button", { name: /Lucifron/ })).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(sidebar.getByRole("button", { name: /Lucifron/ }), { ctrlKey: true })
    await expect(within(canvas.getByRole("navigation", { name: "Breadcrumb" })).getByText("2 bosses")).toBeInTheDocument()
    await expect(canvas.getByText(/Fastest total kill time · 2 bosses/)).toBeInTheDocument()

    await userEvent.click(sidebar.getByRole("button", { name: "All bosses" }))
    await expect(sidebar.getByRole("button", { name: /Lucifron/ })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByText("Fastest full clears")).toBeInTheDocument()

    // The column collapses to the left and comes back (left open, since the choice is remembered).
    await userEvent.click(canvas.getByRole("button", { name: "Hide encounters" }))
    await expect(canvas.queryByRole("navigation", { name: "Encounters" })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Show encounters" }))
    await expect(canvas.getByRole("navigation", { name: "Encounters" })).toBeInTheDocument()
  },
}

/**
 * Statistics tab, reached from the overview's "Box plot" link: DPS by spec (class lit), then Kill times
 * (full-clear box over per-boss boxes) and Success rate.
 */
export const Statistics: Story = {
  args: { initialScope: { cls: "WARRIOR" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(within(canvas.getByRole("region", { name: "Where Warrior stands · MC" })).getByRole("button", { name: "Box plot" }))
    const views = within(canvas.getByRole("navigation", { name: "Statistics view" }))
    await expect(views.getByRole("button", { name: "DPS by spec" })).toHaveAttribute("aria-pressed", "true")
    await expect(await canvas.findByText("DPS distribution by spec · Molten Core")).toBeInTheDocument()
    await expect(canvas.getByText(/Warrior highlighted/)).toBeInTheDocument()
    await userEvent.click(views.getByRole("button", { name: "Kill times" }))
    await expect(await canvas.findByText("Full Clear Time")).toBeInTheDocument()
    await userEvent.click(views.getByRole("button", { name: "Success rate" }))
    await expect(views.getByRole("button", { name: "Success rate" })).toHaveAttribute("aria-pressed", "true")
  },
}

/**
 * Performances: today's single-kill leaderboard table, filtered by the hub (boss from the encounter list,
 * class/spec from the picker, DPS/HPS from the role toggle) instead of its own chips.
 */
export const PerformancesTab: Story = {
  args: { initialTab: "performances", initialScope: { boss: "Ragnaros", cls: "WARRIOR" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("Best DPS · Ragnaros")).toBeInTheDocument()
    await expect(canvas.queryByText("All Specs")).not.toBeInTheDocument()
  },
}

/**
 * Parsing: today's view switch (All specs bar chart, Spec details, Kill times), filtered by the hub.
 * A bar opens that spec's detail; the switch goes back to the bar chart. Guilds mode shows kill times.
 */
export const ParsingTab: Story = {
  args: { initialTab: "parsing", initialScope: { boss: "Lucifron" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const views = () => within(canvas.getByRole("navigation", { name: "Parsing view" }))
    await expect(views().getByRole("button", { name: "All specs" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(within(canvas.getByRole("group", { name: "Class" })).getByRole("button", { name: "Warrior" }))
    await userEvent.click(within(await canvas.findByRole("group", { name: "Warrior spec" })).getByRole("button", { name: "Fury" }))
    await userEvent.click(views().getByRole("button", { name: "Spec details" }))
    await expect(await canvas.findByText(/Fury Warrior/)).toBeInTheDocument()
    await userEvent.click(views().getByRole("button", { name: "All specs" }))
    await expect(views().getByRole("button", { name: "All specs" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(canvas.getByRole("button", { name: "Guilds" }))
    await expect(await canvas.findByText("Kill time needed for each parse")).toBeInTheDocument()
  },
}

/**
 * Speedruns, a top-level tab, with a Full clear / Kill times switch. A picked boss opens on its fastest
 * kills; the switch goes to full clears.
 */
export const SpeedrunsBoss: Story = {
  args: { initialTab: "speedruns", initialScope: { boss: "Ragnaros" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const board = () => within(canvas.getByRole("navigation", { name: "Speedrun board" }))
    await expect(board().getByRole("button", { name: /Kill times/ })).toHaveAttribute("aria-pressed", "true")
    await expect(within(canvas.getByRole("region", { name: "Kill times" })).getByText("Ragnaros")).toBeInTheDocument()
    await userEvent.click(board().getByRole("button", { name: "Full clear" }))
    await expect(canvas.getByRole("region", { name: "Fastest full clears" })).toBeInTheDocument()
  },
}

/** Rulesets tab: today's DPS-target and speedrun rules for the instance, under the shared header. */
export const RulesetsTab: Story = { args: { initialTab: "rulesets" } }

/**
 * Instance grid under the page tab bar, as on today's /leaderboards. Each tab's cards carry its headline;
 * picking an instance keeps the tab, and the "Leaderboards" crumb goes back. Rulesets reuse today's grid.
 */
export const AllInstances: StoryObj<typeof LeaderboardsHubApp> = {
  render: () => <LeaderboardsHubApp />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tabs = () => within(canvas.getByRole("navigation", { name: "Leaderboard section" }))
    await userEvent.click(tabs().getByRole("button", { name: "Ratings" }))
    await userEvent.click(canvas.getByRole("link", { name: /Zul'Gurub/ }))
    await expect(await canvas.findByRole("heading", { level: 1, name: "Zul'Gurub" })).toBeInTheDocument()
    // The open instance carries the tabs in its banner, on the same tab.
    await expect(tabs().getByRole("button", { name: "Ratings" })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByRole("navigation", { name: "Rating metric" })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Leaderboards" }))

    await userEvent.click(await tabs().findByRole("button", { name: "Rulesets" }))
    await userEvent.click(await canvas.findByRole("link", { name: /Molten Core/ }))
    await expect(await canvas.findByRole("heading", { level: 1, name: "Molten Core" })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Leaderboards" }))
    await expect(await canvas.findByRole("link", { name: /Zul'Gurub/ })).toBeInTheDocument()
  },
}

/**
 * Ratings are per realm: the banner's realm picker scopes every tab and the instance grid, and the
 * choice is remembered in this browser for the next visit.
 */
export const RealmSwitch: StoryObj<typeof LeaderboardsHubApp> = {
  render: () => <LeaderboardsHubApp initialInstance="Molten Core" initialTab="ratings" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const leader = () => within(canvas.getByRole("region", { name: "Molten Core Overview leaderboard" })).getAllByRole("listitem")[0].textContent
    const before = leader()
    await userEvent.click(canvas.getByRole("button", { name: /^Realm: / }))
    await userEvent.click(await body.findByRole("menuitem", { name: "Tel'Abim" }), { delay: 100 })
    await expect(await canvas.findByRole("button", { name: "Realm: Tel'Abim" })).toBeInTheDocument()
    await expect(leader()).not.toBe(before)
    await expect(localStorage.getItem(REALM_KEY)).toBe("Tel'Abim")
    // Back to the default so other stories start from it.
    await userEvent.click(canvas.getByRole("button", { name: "Realm: Tel'Abim" }))
    await userEvent.click(await body.findByRole("menuitem", { name: "Nordanaar" }), { delay: 100 })
    await expect(await canvas.findByRole("button", { name: "Realm: Nordanaar" })).toBeInTheDocument()
  },
}

/** The title switches instance in place: same tab and filters, encounter choice back to every boss. */
export const SwitchInstance: StoryObj<typeof LeaderboardsHubApp> = {
  render: () => <LeaderboardsHubApp initialInstance="Molten Core" initialTab="statistics" initialRole="healing" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole("button", { name: "Molten Core, switch instance" }))
    await userEvent.click(await body.findByRole("menuitem", { name: "Zul'Gurub" }), { delay: 100 })
    await expect(await canvas.findByRole("heading", { level: 1, name: "Zul'Gurub" })).toBeInTheDocument()
    await expect(within(canvas.getByRole("navigation", { name: "Leaderboard section" })).getByRole("button", { name: "Statistics" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await expect(canvas.getByRole("button", { name: "Healing" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(canvas.getByRole("button", { name: "Leaderboards" }))
    await expect(await canvas.findByRole("link", { name: /Blackwing Lair/ })).toBeInTheDocument()
  },
}
