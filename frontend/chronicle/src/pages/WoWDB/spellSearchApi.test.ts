import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchError } from "@/pages/InstanceSearch/searchApi";
import {
  runSpellSearch,
  SPELL_SEARCH_LIMIT_REFETCH_MS,
  spellSearchLimitRefetchInterval,
  type SpellSearchLimitResponse,
} from "./spellSearchApi";

const query = {
  context: { level: null, difficulty: 0 },
  where: { field: "spell.name", op: "contains" as const, value: "frost" },
};

afterEach(() => vi.unstubAllGlobals());

function limit(remaining: number, maximum = 800): SpellSearchLimitResponse {
  return {
    logged_in: true,
    allowed: true,
    required_tier: "revered",
    limit: maximum,
    remaining,
    refill_per_minute: 60,
    reset_seconds: remaining < maximum ? maximum - remaining : 0,
  };
}

describe("spell search API", () => {
  it("returns pages and shared search charge headers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [], next: { spell_id: 20 } }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Chronicle-Search-Cost": "12",
        "Chronicle-Search-Runtime-Cost": "3",
        "RateLimit-Limit": "800",
        "RateLimit-Remaining": "785",
        "RateLimit-Reset": "15",
      },
    })));

    const result = await runSpellSearch(query);
    expect(result.page.next).toEqual({ spell_id: 20 });
    expect(result.cost).toBe(12);
    expect(result.runtimeCost).toBe(3);
    expect(result.budget).toEqual({ limit: 800, remaining: 785, resetSeconds: 15 });
  });

  it("preserves supporter CTA and retry metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Revered supporter required.",
      call_to_action: "Upgrade to run advanced spell searches.",
      link: "/supporter",
      link_text: "View supporter perks",
    }), { status: 403, headers: { "Content-Type": "application/json", "Retry-After": "4" } })));

    await expect(runSpellSearch(query)).rejects.toMatchObject({
      status: 403,
      link: "/supporter",
      retryAfterSeconds: 4,
      loginRequired: false,
    } satisfies Partial<SearchError>);
  });
});

describe("spell search limit polling", () => {
  it("polls while the shared bucket is refilling", () => {
    expect(spellSearchLimitRefetchInterval(limit(799))).toBe(SPELL_SEARCH_LIMIT_REFETCH_MS);
    expect(spellSearchLimitRefetchInterval(limit(800))).toBe(false);
    expect(spellSearchLimitRefetchInterval(undefined)).toBe(false);
  });
});
