import { afterEach, describe, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { useCharacterPerformance, useRankingsLeaderboard, useRankingsStats, useRankingsKillTimes, useRankingsSuccessRates } from "./rankingsQueries"

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn((options) => options) }))

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe("rankings query cohort serialization", () => {
  it.each([useRankingsLeaderboard, useRankingsStats])("preserves an explicitly selected empty difficulty and zero size", async (hook) => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal("fetch", fetcher)
    hook({ instance_names: "Molten Core", difficulty_names: "", max_players: 0 })
    const options = vi.mocked(useQuery).mock.calls[0][0]
    if (typeof options.queryFn !== "function") throw new Error("Expected rankings query function")
    await options.queryFn({} as never)
    const params = new URL(String(fetcher.mock.calls[0][0]), "http://localhost").searchParams
    expect(params.has("difficulty_names")).toBe(true)
    expect(params.get("difficulty_names")).toBe("")
    expect(params.get("max_players")).toBe("0")
  })
})

 describe("character performance difficulty filter", () => {
  it.each(["", "heroic", "mythic", undefined])("preserves difficulty %s distinctly from no filter", async (difficultyName) => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetcher);
    useCharacterPerformance({ playerGuid: "player", instanceName: "Raid", encounterNames: ["Boss"], metric: "dps", difficultyName });
    const options = vi.mocked(useQuery).mock.calls[0][0];
    if (typeof options.queryFn !== "function") throw new Error("Expected query function");
    await options.queryFn({} as never);
    const params = new URL(String(fetcher.mock.calls[0][0]), "http://localhost").searchParams;
    expect(params.has("difficulty_name")).toBe(difficultyName !== undefined);
    expect(params.get("difficulty_name")).toBe(difficultyName ?? null);
  });
});

describe("encounter variant scope", () => {
  const leaderboard = useRankingsLeaderboard;
  const stats = useRankingsStats;
  const killTimes = useRankingsKillTimes;
  const successRates = useRankingsSuccessRates;
  const scope = { encounter_names: "Hodir,Freya", difficulty_names: "", max_players: 10, exact_cohort: true, realm_names: "Realm", encounter_variants: { Hodir: "hard" as const } };
  for (const kind of ["leaderboard", "stats", "kill-times", "success-rates"]) {
    it(`serializes the same scope and variant cache identity for ${kind}`, async () => {
      const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
      vi.stubGlobal("fetch", fetcher);
      const run = (variants: typeof scope.encounter_variants | undefined) => {
        const selected = { ...scope, encounter_variants: variants };
        const hooks = {
          leaderboard: () => leaderboard({ instance_names: "Ulduar", ...selected }),
          stats: () => stats({ instance_names: "Ulduar", ...selected }),
          "kill-times": () => killTimes("Ulduar", undefined, true, selected),
          "success-rates": () => successRates("Ulduar", undefined, selected),
        };
        hooks[kind as keyof typeof hooks]();
        return vi.mocked(useQuery).mock.calls.at(-1)![0];
      };
      const exact = run(scope.encounter_variants);
      if (typeof exact.queryFn !== "function") throw new Error("Expected query function");
      await exact.queryFn({} as never);
      const params = new URL(String(fetcher.mock.calls[0][0]), "http://localhost").searchParams;
      expect(Object.fromEntries(params)).toMatchObject({ encounter_names: "Hodir,Freya", difficulty_names: "", max_players: "10", exact_cohort: "true", realm_names: "Realm", encounter_variants: '{"Hodir":"hard"}' });
      const combined = run(undefined);
      expect(combined.queryKey).not.toEqual(exact.queryKey);
      if (typeof combined.queryFn !== "function") throw new Error("Expected query function");
      await combined.queryFn({} as never);
      expect(new URL(String(fetcher.mock.calls[1][0]), "http://localhost").searchParams.has("encounter_variants")).toBe(false);
    });
  }
});

it("does not fetch success rates or attempt counts for exact encounter variants", () => {
  useRankingsSuccessRates("Ulduar", undefined, { encounter_names: "Hodir,Freya", encounter_variants: { Hodir: "hard" } });
  expect(vi.mocked(useQuery).mock.calls.at(-1)![0].enabled).toBe(false);
  useRankingsSuccessRates("Ulduar", undefined, { encounter_names: "Hodir,Freya" });
  expect(vi.mocked(useQuery).mock.calls.at(-1)![0].enabled).toBe(true);
});
