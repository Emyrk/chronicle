import { MemoryRouter } from "react-router-dom";
import { FirstKillsCard } from "./FirstKillsCard";
import type { CharacterEncounterStats } from "@/api/typesGenerated";
import { RecentNightsCard } from "./RecentNightsCard";
import type { RecentInstance } from "@/api/typesGenerated";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterPerformanceRun } from "@/api/typesGenerated";
import { PerformanceSummaryPanel, type PerformanceSummaryPlayer } from "./PerformanceSummary";
import { guildAttributes } from "@/components/EntityMenu/leaderboardEntities";

const player: PerformanceSummaryPlayer = {
  id: "realm:guid",
  guid: "guid",
  realmName: "Nordanaar",
  name: "Thrall · Nordanaar",
  characterName: "Thrall",
  className: "SHAMAN",
  color: "blue",
  runs: [{ started_at: "2026-11-13T01:00:00Z", dps: 100, hps: 0, duration_secs: 60 } as CharacterPerformanceRun],
};

function summaryHtml(players: PerformanceSummaryPlayer[]) {
  return renderToStaticMarkup(<PerformanceSummaryPanel players={players} metric="dps" display="raw" view="numbers" />);
}

describe("audited Alt mode identities", () => {
  it("uses the actual character GUID, realm and name rather than the comparison key or label", () => {
    const html = summaryHtml([player, { ...player, id: "second" }]);
    expect(html).toContain('data-entity-kind="character"');
    expect(html).toContain('&quot;guid&quot;:&quot;guid&quot;');
    expect(html).toContain('&quot;realm&quot;:&quot;Nordanaar&quot;');
    expect(html).toContain('&quot;name&quot;:&quot;Thrall&quot;');
    expect(html).not.toContain('&quot;guid&quot;:&quot;realm:guid&quot;');
  });

  it("does not invent a realm for summary callers without identity context", () => {
    const legacy = { ...player, realmName: undefined };
    expect(summaryHtml([legacy, { ...legacy, id: "second" }])).not.toContain("data-entity");
  });

  it("marks recent nights with the real log ID, not its slug or raw log duration", () => {
    const instance = {
      id: "log-id", slug: "friendly-slug", name: "Naxxramas",
      first_encounter_time: "2026-11-13T01:00:00Z", duration_ms: 120_000,
      boss_kills: 1,
    } as RecentInstance;
    const html = renderToStaticMarkup(<MemoryRouter><RecentNightsCard instances={[instance]} nightScores={new Map()} onOpenActivity={() => {}} /></MemoryRouter>);
    expect(html).toContain('href="/instances/friendly-slug"');
    expect(html).toContain('&quot;logId&quot;:&quot;log-id&quot;');
    expect(html).toContain('data-entity-kind="raid"');
    expect(html).not.toContain("clearMs");
  });

  it("marks first-kill raid names as aggregates without inventing a clear", () => {
    const encounter = { instance_name: "Naxxramas", encounter_name: "Patchwerk", first_killed_at: "2026-11-13T01:00:00Z" } as CharacterEncounterStats;
    const html = renderToStaticMarkup(<FirstKillsCard encounters={[encounter]} isLoading={false} />);
    expect(html).toContain('&quot;id&quot;:&quot;raid:Naxxramas:&quot;');
    expect(html).not.toContain("clearMs");
    expect(html).not.toContain("logId");
  });

  it("leaves unknown guilds unmarked", () => {
    expect(guildAttributes(undefined, "Unknown")).toEqual({});
    expect(guildAttributes("00000000-0000-0000-0000-000000000000", "Unknown")).toEqual({});
    expect(guildAttributes("guild-id", "The Horde")["data-entity-kind"]).toBe("guild");
  });
});
