import { afterEach, describe, expect, it, vi } from "vitest";
import { configuration } from "./v2RatingAdapter.testdata";
import { fetchResolvedHubSummary, resolvedHubMetadata } from "./resolvedHubAdapter";
import type { RankingsInstanceSummary } from "@/api/typesGenerated";

const dungeon: RankingsInstanceSummary = {
  instance_name: "Deadmines", difficulty_name: "", max_players: 0,
  category: "dungeon", total_kills: 34, top_players: [],
};
const raid: RankingsInstanceSummary = {
  ...dungeon, instance_name: "Raid", category: "raid",
};
const lunatic = { ...configuration, effective_flavor: ["vanilla", "lunatic"] };

describe("Lunatic dungeon speedrun discovery", () => {
  it("lists published dungeons instead of configured raids for Lunatic speedruns", () => {
    const summary = resolvedHubMetadata(lunatic, { tab: "speedruns", performance: "dps" }, [], [], [raid, dungeon]);
    expect(summary.instances).toEqual([dungeon]);
  });

  it.each(["overview", "ratings", "performances", "statistics", "parsing", "rulesets"] as const)("keeps configured instances for the %s landing", (tab) => {
    const summary = resolvedHubMetadata(lunatic, { tab, performance: "dps" }, [], [], [raid, dungeon]);
    expect(summary.instances.map((instance) => instance.instance_name)).toEqual(["Raid"]);
  });

  it("keeps configured speedrun instances without the Lunatic flavor", () => {
    const summary = resolvedHubMetadata(configuration, { tab: "speedruns", performance: "dps" }, [], [], [raid, dungeon]);
    expect(summary.instances.map((instance) => instance.instance_name)).toEqual(["Raid"]);
  });

  it("opens a published dungeon without querying unconfigured raid ratings", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/v1/leaderboard-configuration") return { ok: true, json: async () => lunatic };
      if (url === "/api/v1/realms") return { ok: true, json: async () => [] };
      if (url === "/api/v1/rankings/instances") return { ok: true, json: async () => [raid, dungeon] };
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    const summary = await fetchResolvedHubSummary({ instanceName: "Deadmines", performance: "dps", metadataOnly: true });
    expect(summary.instances).toEqual([dungeon]);
    expect(summary.selected_cohort).toEqual({ difficulty_name: "", max_players: 0 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

const performance = { player_name: "Mage", dps: 1234 };
const speedrun = { instance_id: "run", guild_name: "Raiders", duration_ms: 3600000 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolved Hub overview boards", () => {
  it("loads best performances and speedruns for the selected zero-size cohort", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      let data: unknown;
      if (url === "/api/v1/leaderboard-configuration") data = configuration;
      else if (url === "/api/v1/realms") data = [{ id: "realm", name: "Realm" }];
      else if (url === "/api/v1/rankings/instances") data = [{ instance_name: "Raid", difficulty_name: "Normal", max_players: 40, category: "raid", total_kills: 12, top_players: [] }];
      else if (url.includes("view=cohorts")) data = [{ player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", metric: "dps" }];
      else if (url.startsWith("/api/v1/leaderboards-v2?")) data = { entries: [] };
      else if (url.startsWith("/api/v1/rankings/leaderboard?")) data = { entries: [performance], total_count: 1 };
      else if (url.startsWith("/api/v1/rankings/speedrun?")) data = [speedrun];
      else throw new Error(`Unexpected URL: ${url}`);
      return { ok: true, json: async () => data };
    }));

    const summary = await fetchResolvedHubSummary({
      instanceName: "Raid",
      cohort: { difficulty: "", maxPlayers: 0 },
      performance: "dps",
      realmIDs: ["realm"],
    });

    expect(summary.performances).toEqual([performance]);
    expect(summary.speedruns).toEqual([speedrun]);

    const performanceURL = new URL(urls.find((url) => url.startsWith("/api/v1/rankings/leaderboard?"))!, "http://localhost");
    expect(Object.fromEntries(performanceURL.searchParams)).toMatchObject({
      instance_names: "Raid",
      encounter_names: "A",
      difficulty_names: "",
      max_players: "0",
      exact_cohort: "true",
      metric: "dps",
      realm_names: "Realm",
      limit: "5",
    });
    const speedrunURL = new URL(urls.find((url) => url.startsWith("/api/v1/rankings/speedrun?"))!, "http://localhost");
    expect(Object.fromEntries(speedrunURL.searchParams)).toMatchObject({
      instance_name: "Raid",
      difficulty_name: "",
      instance_max_players: "0",
      timing: "full",
      realm_name: "Realm",
    });
  });
});
