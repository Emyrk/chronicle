vi.mock("./AdminLeaderboardHighlights", () => ({ AdminLeaderboardHighlights: () => <section>Refresh highlights</section> }));
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OperationSummary,
  TenantLeaderboardOperations,
} from "./AdminLeaderboardOperations";
import {
  utcToday,
  utcTomorrow,
  operationActive,
  operationPhaseDescription,
  type LeaderboardOperation,
} from "@/api/leaderboardOperations";
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  operations: [] as unknown[],
}));
vi.mock("./AdminLeaderboardQueues", () => ({
  AdminLeaderboardQueues: ({ tenantName }: { tenantName: string }) => (
    <section aria-label={`${tenantName} leaderboard dirty queues`}>
      Dirty queues
    </section>
  ),
}));
vi.mock("@/api/queries", () => ({ useAdminTenants: () => ({ data: [] }) }));
vi.mock("@/api/leaderboardOperations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/leaderboardOperations")>()),
  useLeaderboardOperations: () => ({
    data: { operations: mocks.operations },
    isPending: false,
    isError: false,
  }),
  useLeaderboardOperationDetail: () => ({
    data: undefined,
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
  after_date: "2026-10-01",
  before_date: "2026-11-07",
  cutoff: "2026-11-07T09:00:00Z",
  date_basis: "run_end_time",
  missing_dates: 3,
  state: "paused",
  phase: "runs",
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
  it("calculates UTC today and defaults the exclusive end to tomorrow", () => {
    const now = new Date("2026-11-06T19:00:00-08:00");
    expect(utcToday(now)).toBe("2026-11-07");
    expect(utcTomorrow(now)).toBe("2026-11-08");
  });
  it("renders tenant-local backfill, repair and explicit completion date semantics", () => {
    const html = renderToStaticMarkup(
      <TenantLeaderboardOperations tenantID="tenant-a" tenantName="Turtle" />,
    );
    expect(html).toContain("Backfill Turtle");
    expect(html).toContain("Turtle leaderboard dirty queues");
    expect(html).toContain("Uses the same pipeline as Repair tenant");
    expect(html).toContain("including runs already represented");
    expect(html).toContain("Records a repair and shows a recalculation notice");
    expect(html).toContain("Ignores the date cutoff");
    expect(html).toContain("Runs completed from");
    expect(html).toContain("Optional · 00:00 UTC (inclusive)");
    expect(html).toContain("Runs completed before");
    expect(html).toContain("00:00 UTC (exclusive)");
    expect(html).toContain("defaults to tomorrow");
    expect(html).not.toContain("max=\"");
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
    expect(html).toContain("27 obligations / keys discovered");
    expect(html).toContain("3 runs have no completion date");
    expect(html).toContain("2026-10-01 00:00 UTC (inclusive)");
    expect(html).toContain("2026-11-07 00:00 UTC (exclusive)");
  });
  it("distinguishes dated discovery from all-time evidence and result reconciliation", () => {
    expect(operationPhaseDescription(operation)).toContain(
      "by completion date",
    );
    expect(operationPhaseDescription({ ...operation, scope: "run" })).toContain(
      "missing completion dates are allowed",
    );
    expect(
      operationPhaseDescription({ ...operation, phase: "evidence" }),
    ).toContain("All-time evidence");
    expect(
      operationPhaseDescription({
        ...operation,
        phase: "player_boss_subjects",
      }),
    ).toContain("All-time result");
    expect(
      operationPhaseDescription({ ...operation, phase: "future_phase" }),
    ).toBe("Phase: future_phase");
    const html = renderToStaticMarkup(
      <OperationSummary
        operation={{
          ...operation,
          backlog: {
            d1_pending: 12,
            d2_pending: 7,
            pending_retries: 2,
            oldest_pending_at: "2026-11-07T08:00:00Z",
          },
        }}
      />,
    );
    expect(html).toContain("D1 pending: 12");
    expect(html).toContain("D2 pending: 7");
    expect(html).toContain("Pending retries: 2");
    expect(html).toContain("includes other queued work");
    expect(html).toContain("2026-11-07 08:00:00 UTC");
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
