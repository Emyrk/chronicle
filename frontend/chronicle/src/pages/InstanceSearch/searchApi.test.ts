import { describe, expect, it } from "vitest";
import type { InstanceSearchLimitResponse } from "@/api/typesGenerated";
import { SEARCH_LIMIT_REFETCH_MS, searchLimitRefetchInterval } from "./searchApi";

function limit(remaining: number, maximum = 300): InstanceSearchLimitResponse {
  return {
    logged_in: true,
    limit: maximum,
    remaining,
    refill_per_minute: 60,
    reset_seconds: remaining < maximum ? maximum - remaining : 0,
  };
}

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
