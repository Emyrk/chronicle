import { http, HttpResponse } from "msw";
import type {
  FavoriteGuild,
  GuildInfo,
  GuildRaidClearsResponse,
  GuildSpeedrunHistoryResponse,
  GuildSpeedrunRun,
} from "@/api/typesGenerated";
import { MOLTEN_CORE_GUILD_HISTORY, type GuildHistoryFixture } from "./GuildHistoryPage.fixtures";

/** Mock API for guild history stories; also used by the entity menu's stats panel. */
// Shift the captured clears so the latest lands two days ago and the date ranges stay meaningful.
const latest = Math.max(...MOLTEN_CORE_GUILD_HISTORY.flatMap((guild) => guild.runs.map((run) => Date.parse(run.completion_time))));
const SHIFT_MS = Date.now() - 2 * 24 * 60 * 60 * 1000 - latest;
const shift = (time: string) => new Date(Date.parse(time) + SHIFT_MS).toISOString();
/** The captured guilds with every run filled in (older captures lack `complete`). */
export type MockGuild = Omit<GuildHistoryFixture, "runs"> & { runs: GuildSpeedrunRun[] };

export const GUILDS: MockGuild[] = MOLTEN_CORE_GUILD_HISTORY.map((guild) => ({
  ...guild,
  runs: guild.runs.map((run): GuildSpeedrunRun => ({
    ...run,
    complete: run.complete ?? run.qualified,
    start_time: shift(run.start_time),
    completion_time: shift(run.completion_time),
    bosses: run.bosses.map((boss) => ({ ...boss, killed_at: shift(boss.killed_at) })),
  })),
}));

const guildById = (id: string) => GUILDS.find((guild) => guild.guildId === id);

function guildInfo(guild: MockGuild): GuildInfo {
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
    claim_locked: false,
  };
}

function favoriteGuild(guild: MockGuild): FavoriteGuild {
  return { id: guild.guildId, name: guild.guildName, realm_id: "realm-eversong", realm_name: guild.realmName };
}

export function whoami(tier: "free" | "honored" | "revered" | "exalted") {
  return http.get("/api/v1/whoami", () => HttpResponse.json({
    user_id: "user-storybook",
    session_id: "session-storybook",
    roles: [],
    max_storage_bytes: 0,
    consumed_storage_bytes: 0,
    preferences: {},
    ads_free: tier !== "free",
    supporter_tier: tier,
  }));
}

export const guildHistoryHandlers = [
  // Signed in as Honored so stories can compare up to five guilds; FriendlyLimit shows the free limit.
  // Every fixture guild is saved as a favorite for the Add guild quick picks.
  whoami("honored"),
  http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null })),
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
        difficulty_name: "Normal",
        max_players: 40,
        dynamic_difficulty: 0,
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
