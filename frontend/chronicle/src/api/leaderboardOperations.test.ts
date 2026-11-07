import { afterEach, describe, expect, it, vi } from "vitest";
import {
  performLeaderboardOperationAction,
  operationKey,
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
      before_date: "2026-11-07",
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
          before_date: "2026-11-07",
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
