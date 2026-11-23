import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse, delay } from "msw"
import { MemoryRouter } from "react-router-dom"
import { expect, userEvent, within } from "storybook/test"
import type { ArmorySearchResult, GuildInfo, SupportedInstance } from "@/api/typesGenerated"
import { NavBar } from "./NavBar"
import { SearchPalette } from "./GlobalSearch/GlobalSearch"

const instances = [
  { name: "Molten Core", category: "raid", progression_bosses: ["Lucifron", "Magmadar", "Golemagg the Incinerator", "Majordomo Executus", "Ragnaros"] },
  { name: "Blackwing Lair", category: "raid", progression_bosses: ["Razorgore the Untamed", "Vaelastrasz the Corrupt", "Chromaggus", "Nefarian"] },
  { name: "Temple of Ahn'Qiraj", category: "raid", progression_bosses: ["The Prophet Skeram", "Princess Huhuran", "C'Thun"] },
  { name: "Naxxramas", category: "raid", progression_bosses: ["Anub'Rekhan", "Patchwerk", "Sapphiron", "Kel'Thuzad"] },
  { name: "Emerald Sanctum", category: "raid", progression_bosses: ["Erennius", "Solnius the Awakener"] },
] as SupportedInstance[]

const players = [
  { id: "1", name: "Ragnarök", realm_name: "Nordanaar", realm_id: "1", class: "Warrior", race: "Orc", gender: "male", level: 60, guild_name: "Ironclad", updated_at: "" },
  { id: "2", name: "Ragefire", realm_name: "Nordanaar", realm_id: "1", class: "Mage", race: "Gnome", gender: "female", level: 60, guild_name: "Nightfall", updated_at: "" },
  { id: "3", name: "Rag", realm_name: "Nordanaar", realm_id: "1", class: "Priest", race: "Human", gender: "female", level: 60, updated_at: "" },
] satisfies ArmorySearchResult[]

const guilds = [
  { id: "g1", name: "Ironclad", realm_id: "1", realm_name: "Nordanaar", has_page: true, player_count: 142, logo_url: "", can_edit: false, can_view_roster: false, can_claim: false, claim_locked: false },
  { id: "g2", name: "Ragged Edge", realm_id: "1", realm_name: "Nordanaar", has_page: false, player_count: 38, logo_url: "", can_edit: false, can_view_roster: false, can_claim: false, claim_locked: false },
] satisfies GuildInfo[]

const matching = <T extends { name: string }>(rows: T[], q: string | null) =>
  rows.filter((row) => row.name.toLowerCase().includes((q ?? "").toLowerCase()))

const dataHandlers = [
  http.get("/api/v1/site-config", () => HttpResponse.json({ billing_enabled: true })),
  http.get("/api/v1/raidlogs/supported", () => HttpResponse.json(instances)),
  http.get("/api/v1/armory/search", ({ request }) => {
    const found = matching(players, new URL(request.url).searchParams.get("q"))
    return HttpResponse.json({ players: found, count: found.length })
  }),
  http.get("/api/v1/guilds/", ({ request }) => {
    const found = matching(guilds, new URL(request.url).searchParams.get("search"))
    return HttpResponse.json({ guilds: found, total: found.length })
  }),
]

const loggedIn = (admin: boolean) => [
  http.get("/api/v1/whoami", () => HttpResponse.json({ user_id: "1", session_id: "s", roles: [], ads_free: false })),
  http.post("/api/v1/authcheck", () => HttpResponse.json(admin ? { admin: true, adminWorldData: true, adminServers: true, adminAuthz: true, adminLogs: true } : {})),
  http.get("/api/v1/me/favorites", () => HttpResponse.json({
    players: [{ ...players[0], gender: "male" }],
    guilds: [{ id: "g1", name: "Ironclad", realm_id: "1", realm_name: "Nordanaar" }],
  })),
  http.get("/api/v1/me/whats-new", () => HttpResponse.json({ has_unread: true })),
  ...dataHandlers,
]

const loggedOut = [http.get("/api/v1/whoami", () => new HttpResponse(null, { status: 204 })), ...dataHandlers]

const meta: Meta<typeof NavBar> = {
  title: "Components/NavBar",
  component: NavBar,
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.route ?? "/"]}>
        <Story />
        <div className="mx-auto max-w-5xl p-8 text-sm text-muted-foreground">Page content</div>
      </MemoryRouter>
    ),
  ],
  parameters: { layout: "fullscreen", msw: { handlers: loggedIn(false) } },
  argTypes: { layout: { control: "inline-radio", options: ["mega", "tabs", "spotlight"] } },
}

export default meta
type Story = StoryObj<typeof NavBar>

const mobile = { viewport: { value: "mobile2", isRotated: false } }

// Layout A: search field + a descriptive "Explore" mega menu.
export const Mega: Story = { args: { layout: "mega" } }
export const MegaOpen: Story = {
  args: { layout: "mega" },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /explore/i }))
  },
}
export const MegaMobile: Story = { args: { layout: "mega" }, globals: mobile }
export const MegaMobileMenu: Story = {
  args: { layout: "mega" },
  globals: mobile,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /open menu/i }))
  },
}

// Layout B: a second row of always-visible feature tabs.
export const Tabs: Story = { args: { layout: "tabs" }, parameters: { route: "/modules" } }
export const TabsMobile: Story = { args: { layout: "tabs" }, globals: mobile, parameters: { route: "/modules" } }

// Layout C: a near-empty bar; a "Features" panel of cards and search do the work.
export const Spotlight: Story = { args: { layout: "spotlight" } }
export const SpotlightOpen: Story = {
  args: { layout: "spotlight" },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /features/i }))
  },
}
export const SpotlightMobile: Story = { args: { layout: "spotlight" }, globals: mobile }
export const SpotlightMobileMenu: Story = {
  args: { layout: "spotlight" },
  globals: mobile,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /open menu/i }))
  },
}

// Account menu with the admin submenu.
export const AdminAccountMenu: Story = {
  args: { layout: "mega" },
  parameters: { msw: { handlers: loggedIn(true) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /account/i }))
  },
}

export const LoggedOut: Story = { args: { layout: "mega" }, parameters: { msw: { handlers: loggedOut } } }
export const GuildPage: Story = { args: { layout: "mega" }, parameters: { route: "/g/example-guild", msw: { handlers: loggedOut } } }
export const Loading: Story = {
  args: { layout: "mega" },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/whoami", async () => {
          await delay("infinite")
          return HttpResponse.json({})
        }),
        ...dataHandlers,
      ],
    },
  },
}

// The search palette on its own, with queries that show each kind of top result.
type PaletteStory = StoryObj<{ initialQuery: string }>
const paletteStory = (initialQuery: string, extra?: Partial<PaletteStory>): PaletteStory => ({
  args: { initialQuery },
  render: ({ initialQuery: query }) => <SearchPalette key={query} open onOpenChange={() => {}} initialQuery={query} />,
  ...extra,
})

export const SearchEmpty = paletteStory("")
export const SearchBoss = paletteStory("ragnaros", {
  play: async () => {
    const body = within(document.body)
    await expect(await body.findByText("Boss leaderboards")).toBeVisible()
  },
})
export const SearchRaidNickname = paletteStory("bwl")
export const SearchExactCharacter = paletteStory("ragefire")
export const SearchGuild = paletteStory("ironclad")
export const SearchPage = paletteStory("modules")
export const SearchMobile = paletteStory("rag", { globals: mobile })
