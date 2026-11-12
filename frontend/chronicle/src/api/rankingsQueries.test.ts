import { afterEach, describe, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { useCharacterPerformance, useRankingsLeaderboard, useRankingsStats } from "./rankingsQueries"

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
