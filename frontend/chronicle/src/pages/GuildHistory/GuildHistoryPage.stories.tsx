import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  FavoriteGuild,
  GuildInfo,
  GuildRaidClearsResponse,
  GuildSpeedrunHistoryResponse,
  GuildSpeedrunRun,
} from "@/api/typesGenerated";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { MOLTEN_CORE_GUILD_HISTORY, type GuildHistoryFixture } from "./GuildHistoryPage.fixtures";
import { GuildHistoryPage } from "./GuildHistoryPage";

// Shift the captured clears so the latest lands two days ago and the date ranges stay meaningful.
const latest = Math.max(...MOLTEN_CORE_GUILD_HISTORY.flatMap((guild) => guild.runs.map((run) => Date.parse(run.completion_time))));
const SHIFT_MS = Date.now() - 2 * 24 * 60 * 60 * 1000 - latest;
const shift = (time: string) => new Date(Date.parse(time) + SHIFT_MS).toISOString();
const GUILDS: GuildHistoryFixture[] = MOLTEN_CORE_GUILD_HISTORY.map((guild) => ({
  ...guild,
  runs: guild.runs.map((run): GuildSpeedrunRun => ({
    ...run,
    start_time: shift(run.start_time),
    completion_time: shift(run.completion_time),
    bosses: run.bosses.map((boss) => ({ ...boss, killed_at: shift(boss.killed_at) })),
  })),
}));

const guildById = (id: string) => GUILDS.find((guild) => guild.guildId === id);

function guildInfo(guild: GuildHistoryFixture): GuildInfo {
  return {
    id: guild.guildId,
    name: guild.guildName,
    realm_id: "realm-eversong",
    realm_name: guild.realmName,
    has_page: false,
    player_count: 40,
    logo_url: "",
    can_edit: false,
    can_view_roster: false,
    can_claim: false,
  };
}

function favoriteGuild(guild: GuildHistoryFixture): FavoriteGuild {
  return { id: guild.guildId, name: guild.guildName, realm_id: "realm-eversong", realm_name: guild.realmName };
}

const handlers = [
  http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null })),
  // Signed in, with every fixture guild saved as a favorite for the Add guild quick picks.
  http.get("/api/v1/whoami", () => HttpResponse.json({
    user_id: "user-storybook",
    session_id: "session-storybook",
    roles: [],
    max_storage_bytes: 0,
    consumed_storage_bytes: 0,
    preferences: {},
    ads_free: false,
  })),
  http.get("/api/v1/me/favorites", () => HttpResponse.json({ guilds: GUILDS.map(favoriteGuild), players: [] })),
  http.get("/api/v1/guilds/", ({ request }) => {
    const query = (new URL(request.url).searchParams.get("search") ?? "").toLowerCase();
    const guilds = GUILDS.filter((guild) => guild.guildName.toLowerCase().includes(query)).map(guildInfo);
    return HttpResponse.json({ guilds, total: guilds.length });
  }),
  http.get("/api/v1/guilds/:id/speedruns/clears", ({ params }) => {
    const guild = guildById(String(params.id));
    const runs = guild?.runs ?? [];
    const response: GuildRaidClearsResponse = {
      clears: runs.length === 0 ? [] : [{
        instance_name: "Molten Core",
        clear_count: runs.length,
        best_duration_ms: Math.min(...runs.map((run) => run.duration_ms)),
        avg_duration_ms: Math.round(runs.reduce((sum, run) => sum + run.duration_ms, 0) / runs.length),
        last_cleared_at: runs[runs.length - 1].completion_time,
      }],
    };
    return HttpResponse.json(response);
  }),
  http.get("/api/v1/guilds/:id/speedruns/history", ({ params, request }) => {
    const guild = guildById(String(params.id));
    const instance = new URL(request.url).searchParams.get("instance_name");
    const response: GuildSpeedrunHistoryResponse = { runs: instance === "Molten Core" ? guild?.runs ?? [] : [] };
    return HttpResponse.json(response);
  }),
  http.get("/api/v1/guilds/:id", ({ params }) => {
    const guild = guildById(String(params.id));
    return guild ? HttpResponse.json(guildInfo(guild)) : new HttpResponse(null, { status: 404 });
  }),
];

function pathFor(names: string[], extra = "") {
  const search = new URLSearchParams();
  for (const name of names) search.append("guild", GUILDS.find((guild) => guild.guildName === name)!.guildId);
  return `/guild-history?${search.toString()}${extra}`;
}

const meta = {
  title: "Pages/GuildHistory",
  component: GuildHistoryPage,
  parameters: { layout: "fullscreen", msw: { handlers }, path: pathFor(["LaNuit"]) },
  decorators: [
    (Story, context) => (
      <TooltipProvider>
        <MemoryRouter initialEntries={[context.parameters.path as string]}>
          <Routes>
            <Route path="/guild-history" element={<Story />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof GuildHistoryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One guild, with real Molten Core clears captured from capy. Use "Add guild" to compare:
 * Zug Zug, Once Upon, LaNuit and Eternal Saints are saved as favorites.
 */
export const OneGuild: Story = {};

/** Zug Zug runs several groups a week, so its clears swing widely. */
export const SeveralGroups: Story = {
  parameters: { path: pathFor(["Zug Zug"]) },
};

export const CompareGuilds: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"]) },
};

export const BossSplitsSingle: Story = {
  parameters: { path: pathFor(["LaNuit"], "&tab=bosses") },
};

export const BossSplitsCompare: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&tab=bosses&range=60d") },
};

/** Ragnaros kill times across guilds, picked from Focus or by clicking a boss in Boss splits. */
export const FocusBoss: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&boss=Ragnaros&tab=bosses") },
};

/** Switch the summary to "Box plot" to compare how spread out each guild's clears are. */
export const BoxPlot: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&range=60d") },
  play: async ({ canvasElement }) => {
    const button = await waitForButton(canvasElement, "Box plot");
    button.click();
  },
};

/** Shift+click a guild chip to hide it from the results while keeping it selected. */
export const HiddenGuild: Story = {
  parameters: {
    path: `${pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"])}&hide=${GUILDS.find((guild) => guild.guildName === "Once Upon")!.guildId}`,
  },
};

/** Clear-time parses: how each clear ranked against the server's. Older clears have no stored parse. */
export const ParseMode: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&display=parse&range=60d") },
};

/** Ragnaros kill parses for one guild. */
export const BossParse: Story = {
  parameters: { path: pathFor(["LaNuit"], "&display=parse&boss=Ragnaros") },
};

/** Idle time per clear, one of the clear parts the Focus box offers. */
export const IdleTime: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&part=idle&range=60d") },
};

export const Landing: Story = {
  parameters: { path: "/guild-history" },
};

async function waitForButton(root: HTMLElement, label: string): Promise<HTMLButtonElement> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const button = [...root.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
    if (button) return button;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No "${label}" button`);
}
