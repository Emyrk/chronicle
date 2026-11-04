import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { InstanceSearchFieldsResponse, InstanceSearchQuery, InstanceSearchResult, SupportedInstance } from "@/api/typesGenerated";
import { InferenceRuntimeProvider } from "@/features/chat/runtime";
import { InstanceSearchPage } from "./InstanceSearchPage";
import { SearchGuidePage } from "./SearchGuidePage";
import { encodeQuery, type Node } from "./queryModel";
import { saveRecentSearches, type RecentSearch } from "./recentSearches";
import { mockEvidence } from "./evidence.mocks";
import { EXAMPLES } from "./examples";
// Generated from the Go registry; kept in sync by TestDescribeFixture.
import fieldsFixture from "./fixtures/searchFields.json";

const fields = fieldsFixture as unknown as InstanceSearchFieldsResponse;

const supported: SupportedInstance[] = [
  { name: "Molten Core", category: "raid", boss_count: 10, bosses: ["Lucifron", "Magmadar", "Gehennas", "Garr", "Shazzrah", "Baron Geddon", "Sulfuron Harbinger", "Golemagg the Incinerator", "Majordomo Executus", "Ragnaros"].map((name, i) => ({ entry_id: 1000 + i, name })) },
  { name: "Blackwing Lair", category: "raid", boss_count: 8, bosses: ["Razorgore the Untamed", "Vaelastrasz the Corrupt", "Broodlord Lashlayer", "Firemaw", "Ebonroc", "Flamegor", "Chromaggus", "Nefarian"].map((name, i) => ({ entry_id: 2000 + i, name })) },
  { name: "Onyxia's Lair", category: "raid", boss_count: 1, bosses: [{ entry_id: 3000, name: "Onyxia" }] },
  { name: "Naxxramas", category: "raid", boss_count: 15, bosses: ["Patchwerk", "Grobbulus", "Gluth", "Thaddius", "Sapphiron", "Kel'Thuzad"].map((name, i) => ({ entry_id: 4000 + i, name })) },
];

const zones = ["Molten Core", "Blackwing Lair", "Onyxia's Lair", "Naxxramas", "Zul'Gurub"];
const guilds = ["Ravenholdt", "Sigma", "Fury and Frost", "Nightfall", "", "Pug Life", "Elysium"];
const realms = ["Nordanaar", "Tel'Abim", "Ambershire"];

const BOSS_TOTALS: Record<string, number> = { "Molten Core": 10, "Blackwing Lair": 8, "Onyxia's Lair": 1, Naxxramas: 15, "Zul'Gurub": 10 };

const allRows: InstanceSearchResult[] = Array.from({ length: 60 }, (_, i) => {
  const guild = guilds[i % guilds.length];
  const zone = zones[i % zones.length];
  const total = BOSS_TOTALS[zone] ?? 8;
  // Most runs are full clears; every fourth is a partial night.
  const killed = i % 4 === 3 ? Math.max(1, total - 1 - (i % 3)) : total;
  return {
    player_count: zone === "Zul'Gurub" ? 20 : 38 + (i % 3),
    bosses_killed: killed,
    ...(killed === total && total > 1 ? { clear_time_ms: (55 + ((i * 7) % 70)) * 60_000 } : {}),
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    slug: `story${i}`,
    name: zones[i % zones.length],
    realm_id: `realm-${i % realms.length}`,
    realm_name: realms[i % realms.length],
    guild_id: guild ? `guild-${i % guilds.length}` : null,
    guild_name: guild,
    difficulty_name: "",
    max_players: zones[i % zones.length] === "Zul'Gurub" ? 20 : 40,
    started_at: new Date(Date.UTC(2026, 9, 30, 21) - i * 9 * 3600_000).toISOString(),
  };
});

const session = {
  user_id: "00000000-0000-0000-0000-000000000001",
  session_id: "s",
  username: "storybook",
  roles: [],
  max_storage_bytes: 0,
  consumed_storage_bytes: 0,
  preferences: {},
  ads_free: true,
  // Blocks, Code and Examples are an Honored perk.
  supporter_tier: "honored",
  can_download_raw_logs: false,
  email: "",
};

type SearchMode = "ok" | "empty" | "rate_limited" | "login_required" | "timeout";

function handlers({
  loggedIn,
  search = "ok",
  tier = "honored",
  budgetLeft,
}: {
  loggedIn: boolean;
  search?: SearchMode;
  tier?: string;
  /** Pin the remaining budget (searches don't spend from it). */
  budgetLeft?: number;
}) {
  const supporterLimit = tier === "exalted" ? 2000 : tier === "revered" ? 800 : tier === "honored" ? 300 : 100;
  const limit = loggedIn ? supporterLimit : 40;
  let remaining = budgetLeft ?? limit;
  const rlHeaders = (cost?: number, runtimeCost?: number) => ({
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(Math.floor(remaining)),
    "RateLimit-Reset": String(Math.ceil(((limit - remaining) / (loggedIn ? 60 : 20)) * 60)),
    ...(cost != null ? { "Chronicle-Search-Cost": String(cost) } : {}),
    ...(runtimeCost != null ? { "Chronicle-Search-Runtime-Cost": String(runtimeCost) } : {}),
  });
  return [
    http.get("/api/v1/whoami", () => (loggedIn ? HttpResponse.json({ ...session, supporter_tier: tier }) : new HttpResponse(null, { status: 204 }))),
    http.get("/api/v1/raidlogs/supported", () => HttpResponse.json(supported)),
    http.get("/api/v1/realms", () => HttpResponse.json(realms.map((name, i) => ({ id: `realm-${i}`, server_id: "s", name, description: "" })))),
    // Nightmare of Ursol records sub-specs (Bear / Cat, Tank / DPS, Fury Prot).
    http.get("/api/v1/site-config", () => HttpResponse.json({ dataset_flavor: ["nightmare-of-ursol"] })),
    http.get("/api/v1/raidlogs/search/fields", () => HttpResponse.json(fields)),
    http.get("/api/v1/raidlogs/search/limit", () =>
      HttpResponse.json({ logged_in: loggedIn, limit, remaining, refill_per_minute: loggedIn ? 60 : 20, reset_seconds: 0 }),
    ),
    http.post("/api/v1/raidlogs/search/explain", async ({ request }) => {
      await delay(300);
      const body = (await request.json()) as { query: InstanceSearchQuery };
      remaining = Math.max(0, remaining - 3);
      const where = body.query.where;
      return HttpResponse.json({ matched: true, ...(where ? { evidence: mockEvidence(where) } : {}) }, { headers: rlHeaders(2, 1) });
    }),
    http.post("/api/v1/raidlogs/search", async ({ request }) => {
      await delay(350);
      const body = (await request.json()) as InstanceSearchQuery;
      // A rough stand-in for the real cost: more nodes cost more.
      const cost = 1 + JSON.stringify(body.where ?? {}).split('"field"').length * 2;
      if (search === "login_required") {
        return HttpResponse.json(
          { message: "Log in to use advanced search.", detail: "log in to use advanced search: only simple filters are available without logging in", call_to_action: "Logged-in users can search by players, specs, parses, kill times and more." },
          { status: 403, headers: rlHeaders(cost) },
        );
      }
      if (search === "rate_limited") {
        remaining = 3;
        return HttpResponse.json({ message: "You are searching too quickly. Try again shortly." }, { status: 429, headers: { ...rlHeaders(cost), "Retry-After": "12" } });
      }
      if (search === "timeout") {
        const runtimeCost = 50;
        remaining -= cost + runtimeCost;
        return HttpResponse.json({ message: "This search took too long.", call_to_action: "Narrow it with a zone, realm or date range." }, { status: 422, headers: rlHeaders(cost, runtimeCost) });
      }
      const runtimeCost = 4;
      if (budgetLeft === undefined) remaining = Math.max(0, remaining - cost - runtimeCost);
      if (search === "empty") return HttpResponse.json({ results: [] }, { headers: rlHeaders(cost, runtimeCost) });
      const start = body.cursor ? allRows.findIndex((r) => r.id === body.cursor!.id) + 1 : 0;
      const pageSize = body.limit ?? 25;
      const page = allRows.slice(start, start + pageSize);
      const last = page[page.length - 1];
      const hasMore = start + pageSize < allRows.length;
      return HttpResponse.json(
        { results: page, ...(hasMore && last ? { next: { started_at: last.started_at, id: last.id } } : {}) },
        { headers: rlHeaders(cost, runtimeCost) },
      );
    }),
  ];
}

function url(tree: Node | undefined, mode?: "blocks") {
  const params = new URLSearchParams();
  if (tree !== undefined) params.set("q", encodeQuery(tree));
  if (mode) params.set("mode", mode);
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ""}`;
}

const formTree: Node = {
  and: [
    { field: "instance.name", op: "contains", value: "molten" },
    { any_encounter: { and: [{ field: "encounter.name", op: "=", value: "Ragnaros" }, { field: "encounter.killed", op: "=", value: true }] } },
    { field: "instance.kill_time_parse", op: ">=", value: 90, bosses: ["Ragnaros", "Majordomo Executus"], match: "each" },
    { count_players: { where: { and: [{ field: "player.class", op: "=", value: "PALADIN" }, { field: "player.spec", op: "=", value: "Holy" }] }, op: ">=", value: 2 } },
    { field: "instance.capability", op: "=", value: "unit-position" },
  ],
};

const blockTree: Node = {
  and: [
    { field: "instance.name", op: "in", value: ["Molten Core", "Blackwing Lair"] },
    {
      or: [
        { field: "instance.clear_parse", op: ">=", value: 95, parse_scope: "realm" },
        { field: "instance.kill_time_parse", op: ">=", value: 90, bosses: ["Ragnaros", "Nefarian"], match: "each" },
      ],
    },
    {
      any_player: {
        and: [
          { field: "player.class", op: "=", value: "DRUID" },
          { field: "player.sub_spec", op: "=", value: "Bear", on: "trash" },
          { field: "player.sub_spec", op: "=", value: "Cat" },
        ],
      },
    },
    { count_players: { where: { field: "player.role", op: "=", value: "tank" }, op: ">=", value: 2 } },
    { not: { any_player: { field: "player.deaths", op: ">=", value: 3 } } },
    { field: "instance.idle_time_ms", op: "<=", value: 300000 },
  ],
};

/** Every newer sentence condition, including the Honored ones. */
const sentenceTree: Node = {
  and: [
    { field: "instance.name", op: "=", value: "Molten Core" },
    { field: "instance.max_players", op: "=", value: 40 },
    { any_encounter: { and: [{ field: "encounter.name", op: "=", value: "Ragnaros" }, { field: "encounter.killed", op: "=", value: true }, { field: "encounter.duration_ms", op: "<=", value: 120000 }] } },
    { field: "instance.bosses_killed", op: ">=", value: 10 },
    { field: "instance.wipes", op: "<=", value: 0 },
    { any_player: { and: [{ field: "player.parse", op: ">=", value: 95, bosses: ["Ragnaros"] }, { field: "player.class", op: "=", value: "WARRIOR" }, { field: "player.spec", op: "=", value: "Fury" }] } },
    { field: "instance.boss_time_ms", op: "<=", value: 1200000 },
    { field: "instance.idle_time_ms", op: "<=", value: 300000 },
    { any_player: { and: [{ field: "player.name", op: "=", value: "Thrall" }, { field: "player.dps", op: ">=", value: 1500 }] } },
    { field: "instance.has_video", op: "=", value: true },
  ],
};

const meta: Meta<typeof InstanceSearchPage> = {
  title: "pages/InstanceSearch",
  component: InstanceSearchPage,
  decorators: [
    (Story, context) => (
      <InferenceRuntimeProvider>
        <MemoryRouter initialEntries={[context.parameters.initialEntry ?? "/search"]}>
          <div className="min-h-screen bg-background">
            <Routes>
              <Route path="/search" element={<Story />} />
            </Routes>
          </div>
        </MemoryRouter>
      </InferenceRuntimeProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    msw: { handlers: handlers({ loggedIn: true }) },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Logged in, nothing searched yet. */
export const Empty: Story = {};

/** A shared form search: results load from the URL, with "Load more". */
export const FormWithResults: Story = {
  parameters: { initialEntry: url(formTree) },
};

/** The sentence form with every newer condition, as an Honored supporter. */
export const SentenceConditions: Story = {
  parameters: { initialEntry: url(sentenceTree) },
};

/** Without Honored, Honored conditions are locked and Search is disabled. */
export const NotHonoredHonoredConditions: Story = {
  parameters: { initialEntry: url(sentenceTree), msw: { handlers: handlers({ loggedIn: true, tier: "" }) } },
};

/** A query the form can't show opens in the block editor; "Form" is disabled. */
export const Blocks: Story = {
  parameters: { initialEntry: url(blockTree, "blocks") },
};

/** Logged in without Honored: Code and the costly conditions are locked. */
export const NotHonored: Story = {
  parameters: { initialEntry: url(formTree), msw: { handlers: handlers({ loggedIn: true, tier: "" }) } },
};

/** A non-Honored user can edit a shared block search; Honored fields are locked and Search is off until they are removed. */
export const NotHonoredSharedBlocks: Story = {
  parameters: { initialEntry: url(blockTree, "blocks"), msw: { handlers: handlers({ loggedIn: true, tier: "" }) } },
};

/** Logged out: run conditions only, with a log-in banner. */
export const LoggedOut: Story = {
  parameters: {
    initialEntry: url({ and: [{ field: "instance.name", op: "contains", value: "naxx" }] }),
    msw: { handlers: handlers({ loggedIn: false }) },
  },
};

/** The server refused the query for an anonymous caller. */
export const LoginRequired: Story = {
  parameters: {
    initialEntry: url({ and: [{ field: "instance.name", op: "contains", value: "molten" }] }),
    msw: { handlers: handlers({ loggedIn: false, search: "login_required" }) },
  },
};

export const RateLimited: Story = {
  parameters: { initialEntry: url(formTree), msw: { handlers: handlers({ loggedIn: true, search: "rate_limited" }) } },
};

export const TimedOut: Story = {
  parameters: { initialEntry: url(blockTree, "blocks"), msw: { handlers: handlers({ loggedIn: true, search: "timeout" }) } },
};

/** Date and number ranges (between) in the block editor. */
export const Ranges: Story = {
  parameters: {
    initialEntry: url(
      {
        and: [
          { field: "instance.name", op: "=", value: "Molten Core" },
          { field: "instance.started_at", op: "between", value: ["2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"] },
          { field: "instance.clear_time_ms", op: "between", value: [3_600_000, 4_500_000] },
        ],
      },
      "blocks",
    ),
  },
};

/** History from earlier searches in this browser, under the Recent menu. */
export const RecentSearches: Story = {
  beforeEach: () => {
    const now = Date.now();
    const list: RecentSearch[] = [
      { q: encodeQuery(formTree), mode: "form", at: now - 5 * 60_000 },
      { q: encodeQuery(blockTree), mode: "blocks", at: now - 3 * 3_600_000 },
      { q: encodeQuery({ and: [{ field: "instance.name", op: "contains", value: "naxx" }] }), mode: "form", at: now - 2 * 86_400_000 },
    ];
    saveRecentSearches(list);
    return () => saveRecentSearches([]);
  },
};

export const NoResults: Story = {
  parameters: { initialEntry: url(formTree), msw: { handlers: handlers({ loggedIn: true, search: "empty" }) } },
};

// A search costing 52: two per-boss kill fields, a parse, a count and three player / pull blocks.
const costlyTree = EXAMPLES.find((e) => e.id === "28_one_pull_rag_cat_shaman_carry")!.where;

/** The live cost beside Search (click Edit). Hover it for the breakdown. */
export const LiveCost: Story = {
  parameters: { initialEntry: url(costlyTree, "blocks") },
};

/** Costs more than what's left right now: amber, with how long until enough refills. */
export const ShortOnBudget: Story = {
  parameters: { initialEntry: url(costlyTree, "blocks"), msw: { handlers: handlers({ loggedIn: true, budgetLeft: 20 }) } },
};

/** Costs more than the whole budget: red, and Search is disabled. */
export const TooComplex: Story = {
  parameters: {
    initialEntry: url(
      {
        and: Array.from({ length: 20 }, (_, i) => ({
          any_player: { field: "player.parse", op: ">=", value: 80 + i, bosses: ["Ragnaros"] },
        })),
      },
      "blocks",
    ),
  },
};

/** The /search/guide page (Tools & FAQ), with the live field reference. */
export const Guide: Story = {
  render: () => <SearchGuidePage />,
};
