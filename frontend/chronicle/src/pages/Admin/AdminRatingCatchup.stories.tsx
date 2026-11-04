import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import type { AdminRatingCatchupStatusResponse, AdminTenantRatingCatchup } from "@/api/typesGenerated";
import { AdminRatingCatchup } from "./AdminRatingCatchup";

const root: AdminTenantRatingCatchup = {
  tenant_id: "00000000-0000-0000-0000-000000000000",
  status: "catching_up",
  read_state: "evolving",
  dirty_runs: 12000,
  dirty_renown: 3400,
  dirty_mastery: 850,
  dirty_peak: 190,
  policy_scan_stages: 6,
  unfinished_policy_scan_stages: 4,
  policy_scan_stage_number: 3,
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
  status: "caught_up",
  dirty_runs: 0,
  dirty_renown: 0,
  dirty_mastery: 0,
  dirty_peak: 0,
  unfinished_policy_scan_stages: 0,
  policy_scan_stage_number: 0,
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
    msw: { handlers: [http.get("/api/v1/admin/ratings/catchup", () => HttpResponse.json(response([root, tenant])))] },
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
