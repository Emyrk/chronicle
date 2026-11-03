import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { InstanceSearchFieldsResponse, InstanceSearchQuery, InstanceSearchResult, SupportedInstance } from "@/api/typesGenerated";
import { InstanceSearchPage } from "./InstanceSearchPage";
import { encodeQuery, type Node } from "./queryModel";
// Generated from the Go registry; kept in sync by TestDescribeFixture.
import fieldsFixture from "./fixtures/searchFields.json";

const fields = fieldsFixture as unknown as InstanceSearchFieldsResponse;

const supported: SupportedInstance[] = [
  { name: "Molten Core", category: "raid", bosses: ["Lucifron", "Magmadar", "Gehennas", "Garr", "Shazzrah", "Baron Geddon", "Sulfuron Harbinger", "Golemagg the Incinerator", "Majordomo Executus", "Ragnaros"].map((name, i) => ({ entry_id: 1000 + i, name })) },
  { name: "Blackwing Lair", category: "raid", bosses: ["Razorgore the Untamed", "Vaelastrasz the Corrupt", "Broodlord Lashlayer", "Firemaw", "Ebonroc", "Flamegor", "Chromaggus", "Nefarian"].map((name, i) => ({ entry_id: 2000 + i, name })) },
  { name: "Onyxia's Lair", category: "raid", bosses: [{ entry_id: 3000, name: "Onyxia" }] },
  { name: "Naxxramas", category: "raid", bosses: ["Patchwerk", "Grobbulus", "Gluth", "Thaddius", "Sapphiron", "Kel'Thuzad"].map((name, i) => ({ entry_id: 4000 + i, name })) },
];

const zones = ["Molten Core", "Blackwing Lair", "Onyxia's Lair", "Naxxramas", "Zul'Gurub"];
const guilds = ["Ravenholdt", "Sigma", "Fury and Frost", "Nightfall", "", "Pug Life", "Elysium"];
const realms = ["Nordanaar", "Tel'Abim", "Ambershire"];

const allRows: InstanceSearchResult[] = Array.from({ length: 60 }, (_, i) => {
  const guild = guilds[i % guilds.length];
  return {
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
  supporter_tier: "",
  can_download_raw_logs: false,
  email: "",
};

type SearchMode = "ok" | "empty" | "rate_limited" | "login_required" | "timeout";

function handlers({ loggedIn, search = "ok" }: { loggedIn: boolean; search?: SearchMode }) {
  let remaining = loggedIn ? 300 : 40;
  const limit = loggedIn ? 300 : 40;
  const rlHeaders = (cost?: number) => ({
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(Math.floor(remaining)),
    "RateLimit-Reset": String(Math.ceil(((limit - remaining) / (loggedIn ? 120 : 20)) * 60)),
    ...(cost != null ? { "Chronicle-Search-Cost": String(cost) } : {}),
  });
  return [
    http.get("/api/v1/whoami", () => (loggedIn ? HttpResponse.json(session) : new HttpResponse(null, { status: 204 }))),
    http.get("/api/v1/raidlogs/supported", () => HttpResponse.json(supported)),
    // Nightmare of Ursol records sub-specs (Bear / Cat, Tank / DPS, Fury Prot).
    http.get("/api/v1/site-config", () => HttpResponse.json({ dataset_flavor: ["nightmare-of-ursol"] })),
    http.get("/api/v1/raidlogs/search/fields", () => HttpResponse.json(fields)),
    http.get("/api/v1/raidlogs/search/limit", () =>
      HttpResponse.json({ logged_in: loggedIn, limit, remaining, refill_per_minute: loggedIn ? 120 : 20, reset_seconds: 0 }),
    ),
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
        remaining -= cost;
        return HttpResponse.json({ message: "This search took too long.", call_to_action: "Narrow it with a zone, realm or date range." }, { status: 422, headers: rlHeaders(cost) });
      }
      remaining = Math.max(0, remaining - cost);
      if (search === "empty") return HttpResponse.json({ results: [] }, { headers: rlHeaders(cost) });
      const start = body.cursor ? allRows.findIndex((r) => r.id === body.cursor!.id) + 1 : 0;
      const pageSize = body.limit ?? 25;
      const page = allRows.slice(start, start + pageSize);
      const last = page[page.length - 1];
      const hasMore = start + pageSize < allRows.length;
      return HttpResponse.json(
        { results: page, ...(hasMore && last ? { next: { started_at: last.started_at, id: last.id } } : {}) },
        { headers: rlHeaders(cost) },
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

const meta: Meta<typeof InstanceSearchPage> = {
  title: "pages/InstanceSearch",
  component: InstanceSearchPage,
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.initialEntry ?? "/search"]}>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/search" element={<Story />} />
          </Routes>
        </div>
      </MemoryRouter>
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

/** A query the form can't show opens in the block editor; "Form" is disabled. */
export const Blocks: Story = {
  parameters: { initialEntry: url(blockTree, "blocks") },
};

/** Logged out: only the Run section, a log-in banner, and no block editor. */
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

export const NoResults: Story = {
  parameters: { initialEntry: url(formTree), msw: { handlers: handlers({ loggedIn: true, search: "empty" }) } },
};
