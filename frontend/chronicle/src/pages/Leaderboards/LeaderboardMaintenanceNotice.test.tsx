import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { LeaderboardMaintenanceNotice } from "./LeaderboardMaintenanceNotice";
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
const notice = {
  kind: "partial_coverage",
  state: "paused",
  message: "Historical discovery paused",
  before_date: "2026-11-07",
  cutoff: "2026-11-07T09:00:00Z",
  date_basis: "run_end_time",
  missing_dates: 3,
};
describe("leaderboard maintenance notice", () => {
  beforeEach(() => vi.mocked(useQuery).mockReset());
  for (const state of ["paused", "discovering", "draining"])
    it(`retains the notice while ${state}`, () => {
      vi.mocked(useQuery).mockReturnValue({
        data: { maintenance: { ...notice, state } },
        isError: false,
      } as ReturnType<typeof useQuery>);
      const html = renderToStaticMarkup(
        <LeaderboardMaintenanceNotice tenantID="tenant-a" />,
      );
      expect(html).toContain("coverage is incomplete");
      expect(html).toContain("3 runs without completion dates");
      expect(html).toContain(state);
      expect(html).toContain("00:00 UTC (exclusive)");
    });
  it("preserves active notice on failure and does not share tenant cache keys", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { maintenance: notice },
      isError: true,
    } as ReturnType<typeof useQuery>);
    const html = renderToStaticMarkup(
      <LeaderboardMaintenanceNotice tenantID="tenant-b" />,
    );
    expect(html).toContain("coverage is incomplete");
    expect(html).toContain("last known maintenance notice");
    const options = vi.mocked(useQuery).mock.lastCall![0] as unknown as {
      queryKey: string[];
      refetchInterval: number;
    };
    expect(options.queryKey).toEqual(["leaderboard-maintenance", "tenant-b"]);
    expect(options.refetchInterval).toBe(30000);
  });
  it("distinguishes repair, clears only authoritative null, and omits root scope", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { maintenance: { ...notice, kind: "repair_in_progress" } },
      isError: false,
    } as ReturnType<typeof useQuery>);
    expect(
      renderToStaticMarkup(<LeaderboardMaintenanceNotice tenantID="tenant" />),
    ).toContain("being recalculated");
    expect(renderToStaticMarkup(<LeaderboardMaintenanceNotice />)).toBe("");
    vi.mocked(useQuery).mockReturnValue({
      data: { maintenance: null },
      isError: false,
    } as ReturnType<typeof useQuery>);
    expect(
      renderToStaticMarkup(<LeaderboardMaintenanceNotice tenantID="tenant" />),
    ).toBe("");
  });
});
