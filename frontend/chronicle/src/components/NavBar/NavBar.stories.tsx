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

// A community tenant with its own branding: the Chronicle icon takes the left slot.
const tenant = [
  http.get("/api/v1/site-config", () => HttpResponse.json({ billing_enabled: true, tenant: { id: "octo", branding: { display_name: "Octo Raiders", square_logo: "/c/chronicle/ChronicleIcon.webp" } } })),
  ...loggedIn(false),
]

const noFavorites = [
  http.get("/api/v1/me/favorites", () => HttpResponse.json({ players: [], guilds: [] })),
  ...loggedIn(false),
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
  args: { search: true },
  parameters: { layout: "fullscreen", msw: { handlers: loggedIn(false) } },
}

export default meta
type Story = StoryObj<typeof NavBar>

const mobile = { viewport: { value: "mobile2", isRotated: false } }
const openMenu = (name: RegExp): Story["play"] => async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name }))
}

export const Default: Story = {}
export const ExploreOpen: Story = { play: openMenu(/explore/i) }
export const FavoritesOpen: Story = { play: openMenu(/favorites/i) }
export const FavoritesEmpty: Story = { parameters: { msw: { handlers: noFavorites } }, play: openMenu(/favorites/i) }
export const AccountOpen: Story = { play: openMenu(/^account/i) }
export const AdminOpen: Story = { parameters: { msw: { handlers: loggedIn(true) } }, play: openMenu(/^admin/i) }
export const SearchHidden: Story = { args: { search: false } }
export const Tenant: Story = { parameters: { msw: { handlers: tenant } } }
export const LoggedOut: Story = { parameters: { msw: { handlers: loggedOut } } }
export const GuildPage: Story = { parameters: { route: "/g/example-guild", msw: { handlers: loggedOut } } }
export const Loading: Story = {
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

export const Mobile: Story = { globals: mobile }
export const MobileMenu: Story = { globals: mobile, play: openMenu(/open menu/i) }
export const MobileMenuAdmin: Story = { globals: mobile, parameters: { msw: { handlers: loggedIn(true) } }, play: openMenu(/open menu/i) }

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

// Every state on one page. Each frame loads its own story, so phone frames get real phone breakpoints.
function StoryFrame({ id, title, width, height }: { id: string; title: string; width?: number; height: number }) {
  return (
    <figure className="flex flex-col gap-1.5" style={{ width: width ?? "100%" }}>
      <figcaption className="text-xs font-medium text-muted-foreground">{title}</figcaption>
      <iframe
        title={title}
        src={`iframe.html?id=components-navbar--${id}&viewMode=story`}
        className="rounded-lg border bg-background"
        style={{ width: width ?? "100%", height }}
      />
    </figure>
  )
}

export const Compare: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-10 p-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Desktop</h2>
        <StoryFrame id="default" title="Signed in" height={100} />
        <StoryFrame id="tenant" title="Community tenant (Chronicle icon keeps the left slot)" height={100} />
        <StoryFrame id="tenant" title="Tenant at 1024px" width={1024} height={100} />
        <StoryFrame id="search-hidden" title="Search hidden (ships this way until the search endpoint lands)" height={100} />
        <StoryFrame id="logged-out" title="Signed out" height={100} />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Menus</h2>
        <StoryFrame id="explore-open" title="Explore" height={560} />
        <div className="flex flex-wrap gap-6">
          <StoryFrame id="favorites-open" title="Favorites" height={360} />
          <StoryFrame id="favorites-empty" title="Favorites, none yet" height={300} />
          <StoryFrame id="account-open" title="Account" height={340} />
          <StoryFrame id="admin-open" title="Admin (admins only)" height={300} />
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Phone</h2>
        <div className="flex flex-wrap gap-6">
          <StoryFrame id="mobile" title="Closed" width={390} height={760} />
          <StoryFrame id="mobile-menu" title="Menu" width={390} height={760} />
          <StoryFrame id="mobile-menu-admin" title="Menu, admin" width={390} height={760} />
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Search</h2>
        <div className="flex flex-wrap gap-6">
          <StoryFrame id="search-empty" title="Empty: favorites + jump to" width={720} height={520} />
          <StoryFrame id="search-boss" title="Boss: “ragnaros”" width={720} height={520} />
          <StoryFrame id="search-mobile" title="Phone: “rag”" width={390} height={700} />
        </div>
      </section>
    </div>
  ),
}
