import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import type {
  CreateLeaderboardOperationRequest,
  LeaderboardOperation,
  LeaderboardOperationList,
  LeaderboardQueueDiagnostics,
  Tenant,
} from "@/api/typesGenerated";
import { AdminLeaderboardOperations } from "./AdminLeaderboardOperations";

const OBSERVED_AT = "2026-11-07T12:00:00Z";

const QUEUE_FAMILIES = [
  "runs",
  "player_boss_benchmarks",
  "player_boss_subjects",
  "guild_boss_benchmarks",
  "guild_boss_subjects",
  "guild_clear_benchmarks",
  "guild_clear_subjects",
  "player_renown",
  "guild_renown",
] as const;

function tenant(index: number, name: string): Tenant {
  return {
    id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    slug: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
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

function queueSnapshot(
  tenantID: string,
  collectedAt: string,
  pendingByFamily: Partial<Record<(typeof QUEUE_FAMILIES)[number], number>> = {},
): LeaderboardQueueDiagnostics {
  return {
    tenant_id: tenantID,
    collected_at: collectedAt,
    queues: QUEUE_FAMILIES.map((family) => {
      const pending = pendingByFamily[family] ?? 0;
      return {
        family,
        pending,
        due: Math.floor(pending * 0.6),
        claimed: Math.floor(pending * 0.2),
        retrying: Math.floor(pending * 0.1),
        oldest_pending_at: pending
          ? new Date(Date.parse(collectedAt) - 45 * 60_000).toISOString()
          : undefined,
        oldest_due_at: pending
          ? new Date(Date.parse(collectedAt) - 30 * 60_000).toISOString()
          : undefined,
      };
    }),
  };
}

function operation(
  tenantID: string,
  overrides: Partial<LeaderboardOperation> = {},
): LeaderboardOperation {
  return {
    id: `op-${tenantID}`,
    tenant_id: tenantID,
    requested_by: "00000000-0000-0000-0000-000000000099",
    purpose: "bootstrap",
    scope: "tenant",
    before_date: "2026-11-01",
    cutoff: "2026-11-01T00:00:00Z",
    date_basis: "run_end_time",
    missing_dates: 0,
    state: "completed",
    phase: "guild_renown_counts",
    discovered: 4800,
    discovery_complete: true,
    started_at: "2026-11-01T00:00:00Z",
    completed_at: "2026-11-01T02:00:00Z",
    last_progress_at: "2026-11-01T02:00:00Z",
    retry_count: 0,
    last_error: "",
    ...overrides,
  };
}

/** Wires up the tenant list, dirty-queue and operation-history endpoints the page depends on. */
function handlersFor(
  tenants: Tenant[],
  queues: Record<string, LeaderboardQueueDiagnostics>,
  operationsByTenant: Record<string, LeaderboardOperation[]>,
) {
  const allOperations = Object.values(operationsByTenant).flat();
  return [
    http.get("/api/v1/admin/tenants", () => HttpResponse.json(tenants)),
    http.get("/api/v1/admin/leaderboard-queues", ({ request }) => {
      const tenantID = new URL(request.url).searchParams.get("tenant_id") ?? "";
      return HttpResponse.json(
        queues[tenantID] ?? queueSnapshot(tenantID, OBSERVED_AT),
      );
    }),
    http.get("/api/v1/admin/leaderboard-operations", ({ request }) => {
      const tenantID = new URL(request.url).searchParams.get("tenant_id") ?? "";
      return HttpResponse.json({
        operations: operationsByTenant[tenantID] ?? [],
      } satisfies LeaderboardOperationList);
    }),
    http.get("/api/v1/admin/leaderboard-operations/:operationID", ({ params }) => {
      const found = allOperations.find((op) => op.id === params.operationID);
      return found
        ? HttpResponse.json(found)
        : new HttpResponse(null, { status: 404 });
    }),
    http.post("/api/v1/admin/leaderboard-operations", async ({ request }) => {
      const body = (await request.json()) as CreateLeaderboardOperationRequest;
      return HttpResponse.json(
        operation(body.tenant_id, {
          id: `op-${body.tenant_id}-new`,
          purpose: body.purpose,
          scope: body.scope,
          before_date: body.before_date ?? "",
          run_id: body.run_id,
          state: "discovering",
          discovery_complete: false,
          completed_at: undefined,
          phase: "runs",
          discovered: 0,
        }),
        { status: 201 },
      );
    }),
    http.post(
      "/api/v1/admin/leaderboard-operations/:operationID/:action",
      ({ params }) => {
        const found = allOperations.find((op) => op.id === params.operationID);
        if (!found) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json({
          ...found,
          state: params.action === "pause" ? "paused" : "discovering",
        } satisfies LeaderboardOperation);
      },
    ),
  ];
}

const IDLE_REALM_NAMES = [
  "Turtle WoW", "Nordanaar", "Wowcircle", "Everlook", "Frostmourne",
  "Ashenvale", "Felwood", "Thunder Bluff", "Stonard", "Silithus",
  "Darkshore", "Dustwallow", "Gadgetzan", "Hinterlands", "Tanaris",
  "Blasted Lands", "Winterspring",
];

/** A batch of long-caught-up tenants: zero pending keys, latest operation completed. */
function idleFixture() {
  const tenants: Tenant[] = [];
  const queues: Record<string, LeaderboardQueueDiagnostics> = {};
  const operationsByTenant: Record<string, LeaderboardOperation[]> = {};
  IDLE_REALM_NAMES.forEach((name, i) => {
    const t = tenant(i + 10, name);
    tenants.push(t);
    queues[t.id] = queueSnapshot(t.id, OBSERVED_AT);
    operationsByTenant[t.id] = [
      operation(t.id, {
        completed_at: new Date(
          Date.parse(OBSERVED_AT) - (i + 1) * 3 * 60 * 60_000,
        ).toISOString(),
      }),
    ];
  });
  return { tenants, queues, operationsByTenant };
}

const meta = {
  title: "Pages/Admin/Leaderboard operations",
  component: AdminLeaderboardOperations,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AdminLeaderboardOperations>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ~20 tenants as tiles: a backlog, a running backfill and a failing repair sort to the front as amber/red tiles; everyone else is a calm green idle tile. */
export const ManyTenants: Story = {
  parameters: {
    msw: { handlers: manyTenantsHandlers() },
  },
};

function manyTenantsHandlers() {
  const idle = idleFixture();
  const backlogged = tenant(1, "Light's Hope");
  const running = tenant(2, "Whitemane");
  const failing = tenant(3, "Living Flame");
  const tenants = [backlogged, running, failing, ...idle.tenants];
  const queues: Record<string, LeaderboardQueueDiagnostics> = {
    [backlogged.id]: queueSnapshot(backlogged.id, OBSERVED_AT, {
      runs: 1200,
      player_boss_benchmarks: 340,
      guild_renown: 90,
    }),
    [running.id]: queueSnapshot(running.id, OBSERVED_AT, { runs: 60 }),
    [failing.id]: queueSnapshot(failing.id, OBSERVED_AT),
    ...idle.queues,
  };
  const operationsByTenant: Record<string, LeaderboardOperation[]> = {
    [backlogged.id]: [
      operation(backlogged.id, {
        completed_at: new Date(
          Date.parse(OBSERVED_AT) - 6 * 60 * 60_000,
        ).toISOString(),
      }),
    ],
    [running.id]: [
      operation(running.id, {
        state: "discovering",
        phase: "runs",
        discovery_complete: false,
        completed_at: undefined,
        discovered: 1800,
        backlog: {
          d1_pending: 120,
          d2_pending: 40,
          pending_retries: 3,
          oldest_pending_at: new Date(
            Date.parse(OBSERVED_AT) - 20 * 60_000,
          ).toISOString(),
        },
      }),
    ],
    [failing.id]: [
      operation(failing.id, {
        state: "draining",
        phase: "guild_boss_subjects",
        last_error:
          "reconciliation failed: evidence row missing for run 93f2c1a0; retry scheduled",
        retry_count: 4,
      }),
    ],
    ...idle.operationsByTenant,
  };
  return handlersFor(tenants, queues, operationsByTenant);
}

/** Every tenant is caught up: a plain grid of green idle tiles, click one open to manage it. */
export const AllIdle: Story = {
  parameters: {
    msw: {
      handlers: (() => {
        const idle = idleFixture();
        return handlersFor(idle.tenants, idle.queues, idle.operationsByTenant);
      })(),
    },
  },
};

/** A failing repair sorts above an idle tenant, even though neither has a dirty queue right now. */
export const TenantError: Story = {
  parameters: {
    msw: {
      handlers: (() => {
        const failing = tenant(1, "Living Flame");
        const quiet = tenant(2, "Turtle WoW");
        const tenants = [failing, quiet];
        const queues = {
          [failing.id]: queueSnapshot(failing.id, OBSERVED_AT),
          [quiet.id]: queueSnapshot(quiet.id, OBSERVED_AT),
        };
        const operationsByTenant = {
          [failing.id]: [
            operation(failing.id, {
              state: "draining",
              phase: "player_boss_subjects",
              last_error:
                "reconciliation failed: evidence row missing for run 93f2c1a0; retry scheduled",
              retry_count: 6,
            }),
          ],
          [quiet.id]: [operation(quiet.id)],
        };
        return handlersFor(tenants, queues, operationsByTenant);
      })(),
    },
  },
};

export const NoTenants: Story = {
  parameters: {
    msw: { handlers: handlersFor([], {}, {}) },
  },
};
