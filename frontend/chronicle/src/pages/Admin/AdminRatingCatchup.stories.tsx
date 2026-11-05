import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import type { AdminRatingCatchupStatusResponse, AdminTenantRatingCatchup } from "@/api/typesGenerated";
import { AdminRatingCatchup } from "./AdminRatingCatchup";

const root: AdminTenantRatingCatchup = {
  tenant_id: "00000000-0000-0000-0000-000000000000",
  tenant_slug: "",
  status: "catching_up",
  read_state: "evolving",
  dirty_runs: 12000,
  dirty_renown: 3400,
  dirty_mastery: 850,
  dirty_peak: 190,
  policy_scan_stages: 6,
  unfinished_policy_scan_stages: 4,
  policy_scan_stage_number: 3,
  policy_scan_started_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  policy_scan_stage_times: [
    { stage: "runs", completed_at: new Date(Date.now() - 50 * 60_000).toISOString() },
    { stage: "renown", completed_at: new Date(Date.now() - 40 * 60_000).toISOString() },
  ],
  active_drain_jobs: 1,
  peak_pages: 12,
  oldest_run: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  scan_source_cutoff: new Date(Date.now() - 30 * 60_000).toISOString(),
  scan_after_run_id: "425fcc30-e484-49d6-9d18-d83aa5cfa4b6",
  job_kind: "drain-tenant-ratings",
  job_state: "running",
};

const tenant: AdminTenantRatingCatchup = {
  ...root,
  tenant_id: "849ddcae-9960-431d-a540-05d2b4c43f6e",
  tenant_slug: "turtle-wow",
  status: "caught_up",
  dirty_runs: 0,
  dirty_renown: 0,
  dirty_mastery: 0,
  dirty_peak: 0,
  unfinished_policy_scan_stages: 0,
  policy_scan_stage_number: 0,
  policy_scan_started_at: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
  policy_scan_stage_times: ["runs", "renown", "mastery", "peak", "player_scope", "guild_scope"].map((stage, index) => ({
    stage, completed_at: new Date(Date.now() - (3 * 60 - index * 10) * 60_000).toISOString(),
  })),
  active_drain_jobs: 0,
  peak_pages: 0,
  oldest_run: undefined,
  scan_source_cutoff: undefined,
  scan_completed_at: new Date().toISOString(),
  job_state: "completed",
  last_succeeded_at: new Date().toISOString(),
};

function response(tenants: AdminTenantRatingCatchup[]): AdminRatingCatchupStatusResponse {
  return { observed_at: new Date().toISOString(), tenants };
}

const scanHandler = http.post("/api/v1/admin/ratings/policy/scan/:tenantID", () =>
  HttpResponse.json({ job_id: 71, job_state: "available" }, { status: 202 }));

const meta = {
  title: "Pages/Admin/Rating catch-up",
  component: AdminRatingCatchup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AdminRatingCatchup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A policy scan and drain are still working through the root tenant's historical backlog. */
export const CatchingUp: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/v1/admin/ratings/catchup", () => HttpResponse.json(response([tenant, root]))), scanHandler] },
  },
};

/** Most tenants are idle and collapse; only the root tenant's backlog stays expanded. */
export const ManyTenants: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/v1/admin/ratings/catchup", () => HttpResponse.json(response([
      root,
      ...Array.from({ length: 40 }, (_, index) => ({
        ...tenant,
        tenant_id: `849ddcae-9960-431d-a540-${String(index).padStart(12, "0")}`,
        tenant_slug: `guild-${index + 1}`,
      })),
    ]))), scanHandler] },
  },
};

export const AllCaughtUp: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/v1/admin/ratings/catchup", () => HttpResponse.json(response([tenant]))), scanHandler] },
  },
};

export const JobFailed: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/v1/admin/ratings/catchup", () => HttpResponse.json(response([{
      ...root,
      job_state: "failed",
      active_drain_jobs: 0,
      job_last_error: "rating policy scan page timed out; retry scheduled",
    }])))] },
  },
};

export const NoTenants: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/v1/admin/ratings/catchup", () => HttpResponse.json(response([])))] },
  },
};
