import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLeaderboardQueues,
  leaderboardQueueKey,
  queueFamilyLabel,
  queueWorkAge,
} from "./leaderboardQueues";
afterEach(() => vi.unstubAllGlobals());
describe("leaderboard queue snapshots", () => {
  it("queries the explicit tenant independently of operation IDs and rejects cross-tenant data", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tenant_id: "a",
        collected_at: "2026-01-01T00:00:00Z",
        queues: [],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    await fetchLeaderboardQueues("a");
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/v1/admin/leaderboard-queues?tenant_id=a",
    );
    await expect(fetchLeaderboardQueues("b")).rejects.toThrow(
      "different tenant",
    );
    expect(leaderboardQueueKey("a")).not.toEqual(leaderboardQueueKey("b"));
  });
  it("keeps request errors visible instead of returning zero snapshots", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: "Database unavailable" }),
      }),
    );
    await expect(fetchLeaderboardQueues("a")).rejects.toThrow(
      "Database unavailable",
    );
  });
  it("uses collected time for age, handles absent dates and unknown family names", () => {
    expect(queueWorkAge("2026-01-01T00:00:00Z", "2026-01-01T01:02:00Z")).toBe(
      "1h 2m",
    );
    expect(queueWorkAge("2026-01-01T00:00:00Z", "2026-01-03T04:00:00Z")).toBe(
      "2d 4h",
    );
    expect(queueWorkAge("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(
      "0s",
    );
    expect(queueWorkAge("2026-01-01T00:00:00Z", "invalid")).toBe("Unavailable");
    expect(queueWorkAge(undefined, "2026-01-01T00:00:00Z")).toBe("—");
    expect(queueWorkAge("bad", "2026-01-01T00:00:00Z")).toBe("Unavailable");
    expect(queueFamilyLabel("player_boss_subjects")).toBe(
      "D2 · Player boss summaries",
    );
    expect(queueFamilyLabel("new_family")).toBe("new family");
  });
});
