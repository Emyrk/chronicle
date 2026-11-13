import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstanceSearchLimitResponse } from "@/api/typesGenerated";
import { explainRun, runSearch, SEARCH_LIMIT_REFETCH_MS, SearchError, searchLimitRefetchInterval } from "./searchApi";

afterEach(() => vi.unstubAllGlobals());

function limit(remaining: number, maximum = 300): InstanceSearchLimitResponse {
  return {
    logged_in: true,
    limit: maximum,
    remaining,
    refill_per_minute: 60,
    reset_seconds: remaining < maximum ? maximum - remaining : 0,
  };
}

describe("search charges", () => {
  it("returns the static and post-query runtime costs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Chronicle-Search-Cost": "13",
            "Chronicle-Search-Runtime-Cost": "7",
            "RateLimit-Limit": "100",
            "RateLimit-Remaining": "80",
            "RateLimit-Reset": "20",
          },
        }),
      ),
    );

    const result = await runSearch({});
    expect(result.cost).toBe(13);
    expect(result.runtimeCost).toBe(7);
    expect(result.budget).toEqual({ limit: 100, remaining: 80, resetSeconds: 20 });
  });
});

describe("search explain", () => {
  it("preserves the validity filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ matched: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await explainRun({ validity: "invalid" }, "00000000-0000-0000-0000-000000000001");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      query: { validity: "invalid" },
      instance_id: "00000000-0000-0000-0000-000000000001",
    });
  });
});

describe("search errors", () => {
  it("does not treat supporter upsells as login prompts", () => {
    expect(new SearchError("Log in", 403).loginRequired).toBe(true);
    expect(new SearchError("Revered perk", 403, undefined, undefined, "/supporter", "View perks").loginRequired).toBe(false);
  });
});

describe("search limit polling", () => {
  it("polls every five seconds while the bucket is refilling", () => {
    expect(searchLimitRefetchInterval(limit(299))).toBe(SEARCH_LIMIT_REFETCH_MS);
    expect(searchLimitRefetchInterval(limit(0))).toBe(SEARCH_LIMIT_REFETCH_MS);
  });

  it("stops before the first response and once the bucket is full", () => {
    expect(searchLimitRefetchInterval(undefined)).toBe(false);
    expect(searchLimitRefetchInterval(limit(300))).toBe(false);
  });
});
