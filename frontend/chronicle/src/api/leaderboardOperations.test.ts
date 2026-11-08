import { afterEach, describe, expect, it, vi } from "vitest";
import {
  performLeaderboardOperationAction,
  operationKey,
  fetchLeaderboardOperationDetail,
} from "./leaderboardOperations";
afterEach(() => vi.unstubAllGlobals());
describe("leaderboard operation requests", () => {
  it("posts explicit tenant and exclusive completion date; single-run repair sends only its run scope", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "op" }) });
    vi.stubGlobal("fetch", fetch);
    await performLeaderboardOperationAction({
      tenant_id: "a",
      purpose: "bootstrap",
      scope: "tenant",
      after_date: "2026-10-01",
      before_date: "2026-11-09",
    });
    expect(fetch.mock.calls[0]).toEqual([
      "/api/v1/admin/leaderboard-operations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: "a",
          purpose: "bootstrap",
          scope: "tenant",
          after_date: "2026-10-01",
          before_date: "2026-11-09",
        }),
      },
    ]);
    await performLeaderboardOperationAction({
      tenant_id: "b",
      purpose: "repair",
      scope: "run",
      run_id: "run",
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      tenant_id: "b",
      purpose: "repair",
      scope: "run",
      run_id: "run",
    });
    expect(operationKey("a")).not.toEqual(operationKey("b"));
  });
  it("fetches backlog detail by operation ID and verifies the owning tenant", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "op",
          tenant_id: "a",
          backlog: { d1_pending: 2, d2_pending: 3, pending_retries: 1 },
        }),
      });
    vi.stubGlobal("fetch", fetch);
    expect(
      (await fetchLeaderboardOperationDetail("a", "op")).backlog?.d2_pending,
    ).toBe(3);
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/v1/admin/leaderboard-operations/op",
    );
    await expect(fetchLeaderboardOperationDetail("b", "op")).rejects.toThrow(
      "different tenant",
    );
  });
  it("uses operation-scoped pause/resume routes and preserves server error messages", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "op" }) });
    vi.stubGlobal("fetch", fetch);
    await performLeaderboardOperationAction({ id: "op", action: "pause" });
    await performLeaderboardOperationAction({ id: "op", action: "resume" });
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/v1/admin/leaderboard-operations/op/pause",
    );
    expect(fetch.mock.calls[1][0]).toBe(
      "/api/v1/admin/leaderboard-operations/op/resume",
    );
    fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: "Operation already active" }),
    });
    await expect(
      performLeaderboardOperationAction({ id: "op", action: "resume" }),
    ).rejects.toThrow("Operation already active");
  });
});
