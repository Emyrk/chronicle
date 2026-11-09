import { afterEach, describe, expect, it, vi } from "vitest"
import { refreshLeaderboardHighlights, useRefreshLeaderboardHighlights } from "./leaderboardHighlights"
const mocks = vi.hoisted(() => ({ invalidateQueries: vi.fn() }))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: unknown) => options,
}))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
describe("highlight refresh request", () => {
  it("posts only the target tenant and preserves queue acceptance", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Leaderboard highlight refresh queued." }), { status: 202 }))
    vi.stubGlobal("fetch", fetch)
    await expect(refreshLeaderboardHighlights("tenant-a")).resolves.toMatchObject({ message: "Leaderboard highlight refresh queued." })
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/leaderboard-highlights/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"tenant_id":"tenant-a"}',
    })
  })
  it("rejects failed requests rather than reporting queued", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Queue unavailable" }), { status: 503 })))
    await expect(refreshLeaderboardHighlights("tenant-a")).rejects.toThrow("Queue unavailable")
  })
  it("invalidates only that tenant's realm keys without clearing or immediate refetch", async () => {
    const options = useRefreshLeaderboardHighlights("tenant-a") as unknown as { onSuccess: () => Promise<void> }
    await options.onSuccess()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["leaderboard-highlights", "tenant-a"], refetchType: "none" })
  })
})
