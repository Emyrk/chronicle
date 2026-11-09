import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRefreshLeaderboardHighlights } from "@/api/leaderboardHighlights"
import { AdminLeaderboardHighlights } from "./AdminLeaderboardHighlights"
vi.mock("@/api/leaderboardHighlights", () => ({ useRefreshLeaderboardHighlights: vi.fn() }))
const render = () => renderToStaticMarkup(<AdminLeaderboardHighlights tenantID="tenant-a" />)
function state(values: object) {
  vi.mocked(useRefreshLeaderboardHighlights).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, ...values } as unknown as ReturnType<typeof useRefreshLeaderboardHighlights>)
}
describe("admin highlights refresh", () => {
  beforeEach(() => state({}))
  it("offers an independent tenant-scoped action, not backfill", () => {
    expect(render()).toContain("Refresh highlights")
    expect(render()).toContain("does not backfill historical runs")
    expect(useRefreshLeaderboardHighlights).toHaveBeenCalledWith("tenant-a")
  })
  it("disables while enqueueing and never calls accepted work complete", () => {
    state({ isPending: true })
    expect(render()).toContain("disabled")
    state({ isSuccess: true })
    expect(render()).toContain("queued, not yet complete")
  })
  it("reports enqueue failure separately", () => {
    state({ isError: true, error: new Error("Queue unavailable") })
    expect(render()).toContain("Could not queue highlight refresh: Queue unavailable")
    expect(render()).not.toContain("queued, not yet complete")
  })
})
