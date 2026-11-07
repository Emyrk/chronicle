import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLeaderboardQueues } from "@/api/leaderboardQueues";
import { AdminLeaderboardQueues } from "./AdminLeaderboardQueues";
vi.mock("@/api/leaderboardQueues", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/leaderboardQueues")>()),
  useLeaderboardQueues: vi.fn(),
}));
const snapshot = {
  tenant_id: "t",
  collected_at: "2026-01-01T01:02:00Z",
  queues: [
    "runs",
    "player_boss_benchmarks",
    "player_boss_subjects",
    "guild_boss_benchmarks",
    "guild_boss_subjects",
    "guild_clear_benchmarks",
    "guild_clear_subjects",
    "player_renown",
    "guild_renown",
  ].map((family, i) => ({
    family,
    pending: i === 0 ? 10 : 0,
    due: i === 0 ? 7 : 0,
    claimed: i === 0 ? 2 : 0,
    retrying: i === 0 ? 3 : 0,
    oldest_pending_at: i === 0 ? "2026-01-01T00:00:00Z" : undefined,
  })),
};
describe("always visible dirty queue dashboard", () => {
  beforeEach(() => vi.mocked(useLeaderboardQueues).mockReset());
  it("renders all nine families including zero rows and only sums pending", () => {
    vi.mocked(useLeaderboardQueues).mockReturnValue({
      data: snapshot,
      isError: false,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useLeaderboardQueues>);
    const html = renderToStaticMarkup(
      <AdminLeaderboardQueues tenantID="t" tenantName="Turtle" />,
    );
    expect(html).toContain("10 pending keys");
    expect(html).not.toContain("22 pending keys");
    expect(html).toContain("D1 · Canonical runs");
    expect(html).toContain("D2 · Guild Renown counts");
    expect(html.match(/scope="row"/g)).toHaveLength(9);
    expect(html).toContain("1h 2m");
    expect(html).toContain("2026-01-01 01:02:00 UTC");
    expect(html).toContain("must not be added together");
  });
  it("retains stale snapshot on refresh errors", () => {
    vi.mocked(useLeaderboardQueues).mockReturnValue({
      data: snapshot,
      isError: true,
      error: new Error("offline"),
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useLeaderboardQueues>);
    const html = renderToStaticMarkup(
      <AdminLeaderboardQueues tenantID="t" tenantName="Turtle" />,
    );
    expect(html).toContain("10 pending keys");
    expect(html).toContain("last successful snapshot");
    expect(html).toContain("offline");
  });
  it("never represents an initial error or loading as zero work", () => {
    for (const loading of [true, false]) {
      vi.mocked(useLeaderboardQueues).mockReturnValue({
        data: undefined,
        isError: !loading,
        error: new Error("offline"),
        isPending: loading,
        isFetching: loading,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useLeaderboardQueues>);
      const html = renderToStaticMarkup(
        <AdminLeaderboardQueues tenantID="t" tenantName="Turtle" />,
      );
      expect(html).not.toContain("0 pending keys");
      expect(html).toContain(
        loading ? "Loading dirty queues" : "unavailable, not zero",
      );
    }
  });
});
