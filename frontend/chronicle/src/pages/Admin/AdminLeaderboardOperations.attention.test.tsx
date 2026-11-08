import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { leaderboardQueueKey } from "@/api/leaderboardQueues";
import { operationKey } from "@/api/leaderboardOperations";
import type {
  LeaderboardOperation,
  LeaderboardQueueDiagnostics,
  Tenant,
} from "@/api/typesGenerated";
import { AdminLeaderboardOperations } from "./AdminLeaderboardOperations";

function tenant(id: string, name: string): Tenant {
  return {
    id,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    disable_client_upload: false,
    include_in_all: true,
    discoverable: true,
    ads_enabled: false,
    disabled_ads: [],
    branding: null,
    parse_config: null,
    default_dataset_id: null,
    default_format: null,
    available_formats: [],
    additional_flavor: [],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}

function queues(tenantID: string, pending: number): LeaderboardQueueDiagnostics {
  return {
    tenant_id: tenantID,
    collected_at: "2026-11-07T12:00:00Z",
    queues: [{ family: "runs", pending, due: 0, claimed: 0, retrying: 0 }],
  };
}

function operation(
  tenantID: string,
  overrides: Partial<LeaderboardOperation> = {},
): LeaderboardOperation {
  return {
    id: `op-${tenantID}`,
    tenant_id: tenantID,
    requested_by: "admin",
    purpose: "bootstrap",
    scope: "tenant",
    before_date: "2026-11-01",
    cutoff: "2026-11-01T00:00:00Z",
    date_basis: "run_end_time",
    missing_dates: 0,
    state: "completed",
    phase: "guild_renown_counts",
    discovered: 10,
    discovery_complete: true,
    started_at: "2026-11-01T00:00:00Z",
    completed_at: "2026-11-01T02:00:00Z",
    last_progress_at: "2026-11-01T02:00:00Z",
    retry_count: 0,
    last_error: "",
    ...overrides,
  };
}

function seedClient(
  tenants: Tenant[],
  data: Record<string, { pending: number; operations: LeaderboardOperation[] }>,
) {
  const client = new QueryClient();
  client.setQueryData(["admin", "tenants"], tenants);
  for (const t of tenants) {
    client.setQueryData(leaderboardQueueKey(t.id), queues(t.id, data[t.id].pending));
    client.setQueryData(operationKey(t.id), { operations: data[t.id].operations });
  }
  return client;
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AdminLeaderboardOperations />
    </QueryClientProvider>,
  );
}

describe("leaderboard operations attention sorting", () => {
  it("renders every tenant as a tile, worst first, and only mounts full controls for the opened tenant", () => {
    const dirty = tenant("t-dirty", "Dirty Tenant");
    const active = tenant("t-active", "Active Tenant");
    const erroring = tenant("t-error", "Erroring Tenant");
    const idleA = tenant("t-idle-a", "Zelda Idle");
    const idleB = tenant("t-idle-b", "Aria Idle");
    const client = seedClient([dirty, active, erroring, idleA, idleB], {
      [dirty.id]: { pending: 500, operations: [operation(dirty.id)] },
      [active.id]: {
        pending: 0,
        operations: [
          operation(active.id, {
            state: "discovering",
            completed_at: undefined,
            discovery_complete: false,
          }),
        ],
      },
      [erroring.id]: {
        pending: 0,
        operations: [operation(erroring.id, { last_error: "boom" })],
      },
      [idleA.id]: { pending: 0, operations: [operation(idleA.id)] },
      [idleB.id]: { pending: 0, operations: [] },
    });
    const html = render(client);

    expect(html).toContain("3 need attention");
    expect(html).toContain("2 idle");
    expect(html).toContain("Dirty Tenant");
    expect(html).toContain("Active Tenant");
    expect(html).toContain("Erroring Tenant");
    expect(html).toContain("Zelda Idle");
    expect(html).toContain("Aria Idle");
    expect(html).toContain("500 pending keys");
    expect(html).toContain("discovering · guild renown counts");
    expect(html).toContain("error · needs attention");
    expect(html).toContain("boom");

    // Worst first: error > active operation > raw pending count > idle (alphabetical).
    const errorIndex = html.indexOf("Erroring Tenant");
    const activeIndex = html.indexOf("Active Tenant");
    const dirtyIndex = html.indexOf("Dirty Tenant");
    const ariaIndex = html.indexOf("Aria Idle");
    const zeldaIndex = html.indexOf("Zelda Idle");
    expect(errorIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeLessThan(activeIndex);
    expect(activeIndex).toBeLessThan(dirtyIndex);
    expect(dirtyIndex).toBeLessThan(ariaIndex);
    expect(ariaIndex).toBeLessThan(zeldaIndex);

    // No tenant's full management card (forms, history table) mounts until
    // its tile is clicked open in the slide-over sheet.
    expect(html).not.toContain("Backfill Dirty Tenant");
    expect(html).not.toContain("Backfill Active Tenant");
    expect(html).not.toContain("Backfill Erroring Tenant");
  });

  it("shows a calm all-idle summary with no tenant needing attention", () => {
    const a = tenant("t-a", "Alpha");
    const b = tenant("t-b", "Beta");
    const client = seedClient([a, b], {
      [a.id]: { pending: 0, operations: [operation(a.id)] },
      [b.id]: { pending: 0, operations: [] },
    });
    const html = render(client);

    expect(html).toContain("0 need attention");
    expect(html).toContain("2 idle");
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain("synced 2026-11-01 02:00:00 UTC");
    expect(html).not.toContain("Backfill Alpha");
    expect(html).not.toContain("Backfill Beta");
  });
});
