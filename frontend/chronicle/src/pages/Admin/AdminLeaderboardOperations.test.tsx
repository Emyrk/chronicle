import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OperationSummary,
  TenantLeaderboardOperations,
} from "./AdminLeaderboardOperations";
import {
  utcToday,
  operationActive,
  type LeaderboardOperation,
} from "@/api/leaderboardOperations";
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  operations: [] as unknown[],
}));
vi.mock("@/api/queries", () => ({ useAdminTenants: () => ({ data: [] }) }));
vi.mock("@/api/leaderboardOperations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/leaderboardOperations")>()),
  useLeaderboardOperations: () => ({
    data: { operations: mocks.operations },
    isPending: false,
    isError: false,
  }),
  useLeaderboardOperationAction: () => ({
    mutate: mocks.mutate,
    isPending: false,
    isError: false,
  }),
}));
const operation: LeaderboardOperation = {
  id: "operation-1",
  tenant_id: "tenant-a",
  requested_by: "admin-a",
  purpose: "bootstrap",
  scope: "tenant",
  before_date: "2026-11-07",
  cutoff: "2026-11-07T09:00:00Z",
  date_basis: "run_end_time",
  missing_dates: 3,
  state: "paused",
  phase: "discovering",
  discovered: 27,
  discovery_complete: false,
  started_at: "2026-11-07T09:00:00Z",
  last_progress_at: "2026-11-07T09:01:00Z",
  retry_count: 1,
  last_error: "",
};
describe("tenant leaderboard operations", () => {
  beforeEach(() => {
    mocks.operations = [];
    mocks.mutate.mockReset();
  });
  it("defaults to today's UTC date rather than the local date", () => {
    expect(utcToday(new Date("2026-11-06T19:00:00-08:00"))).toBe("2026-11-07");
  });
  it("renders tenant-local backfill, repair and explicit completion date semantics", () => {
    const html = renderToStaticMarkup(
      <TenantLeaderboardOperations tenantID="tenant-a" tenantName="Turtle" />,
    );
    expect(html).toContain("Backfill Turtle");
    expect(html).toContain("Runs completed before");
    expect(html).toContain("00:00 UTC (exclusive)");
    expect(html).toContain("Single-run repair");
    expect(html).toContain("without a completion date");
  });
  it("renders persisted audit history and resumes discovery without claiming workers pause", () => {
    mocks.operations = [operation];
    const html = renderToStaticMarkup(
      <TenantLeaderboardOperations tenantID="tenant-a" tenantName="Turtle" />,
    );
    expect(html).toContain("Resume discovery");
    expect(html).toContain("queued D1/D2 processing continues");
    expect(html).toContain("operation-1");
    expect(html).toContain("admin-a");
    expect(html).toContain("27 runs discovered");
    expect(html).toContain("3 runs have no completion date");
    expect(html).toContain("2026-11-07 00:00 UTC");
  });
  it("does not treat discovery completion as operation completion", () => {
    const draining = {
      ...operation,
      state: "draining" as const,
      discovery_complete: true,
    };
    expect(operationActive(draining)).toBe(true);
    expect(
      renderToStaticMarkup(<OperationSummary operation={draining} />),
    ).toContain("all pending tenant processing");
    expect(operationActive({ ...draining, state: "completed" })).toBe(false);
  });
});
