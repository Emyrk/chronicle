import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { AdminRatingCatchupStatusResponse, AdminTenantRatingCatchup } from "@/api/typesGenerated";
import { AdminRatingCatchup } from "./AdminRatingCatchup";

const empty: AdminTenantRatingCatchup = {
  tenant_id: "00000000-0000-0000-0000-000000000000",
  tenant_slug: "",
  status: "caught_up",
  read_state: "evolving",
  dirty_runs: 0,
  dirty_renown: 0,
  dirty_mastery: 0,
  dirty_peak: 0,
  policy_scan_stages: 0,
  unfinished_policy_scan_stages: 0,
  policy_scan_stage_times: [],
  policy_scan_stage_number: 0,
  active_drain_jobs: 0,
  peak_pages: 0,
};

it("shows approximate elapsed and completed stage times without counting the drain", () => {
  const client = new QueryClient();
  client.setQueryData<AdminRatingCatchupStatusResponse>(["admin", "rating-catchup"], {
    observed_at: "2026-11-04T12:00:00Z",
    tenants: [{ ...empty, policy_scan_stages: 6, unfinished_policy_scan_stages: 4,
      policy_scan_stage_number: 3, policy_scan_started_at: "2026-11-04T10:00:00Z",
      policy_scan_stage_times: [
        { stage: "runs", completed_at: "2026-11-04T10:30:00Z" },
        { stage: "renown", completed_at: "2026-11-04T11:00:00Z" },
      ] },
    ],
  });
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><AdminRatingCatchup /></QueryClientProvider>);
  expect(markup).toContain("Elapsed scan time: ≈ 2h 0m");
  expect(markup).toContain("Runs · done · ≈ 30m");
  expect(markup).toContain("Mastery · current · ≈ 1h 0m");
  client.setQueryData<AdminRatingCatchupStatusResponse>(["admin", "rating-catchup"], {
    observed_at: "2026-11-04T12:00:00Z",
    tenants: [{ ...empty, policy_scan_stages: 6, policy_scan_started_at: "2026-11-04T10:00:00Z",
      policy_scan_stage_times: [
        { stage: "runs", completed_at: "2026-11-04T10:30:00Z" },
        { stage: "renown", completed_at: "2026-11-04T11:00:00Z" },
        { stage: "mastery", completed_at: "2026-11-04T11:05:00Z" },
        { stage: "peak", completed_at: "2026-11-04T11:10:00Z" },
        { stage: "player_scope", completed_at: "2026-11-04T11:12:00Z" },
        { stage: "guild_scope", completed_at: "2026-11-04T11:15:00Z" },
      ] },
    ],
  });
  const completed = renderToStaticMarkup(<QueryClientProvider client={client}><AdminRatingCatchup /></QueryClientProvider>);
  expect(completed).toContain("Total scan time: ≈ 1h 15m");
  client.clear();
});

it("sorts tenants by total dirty work and disables an in-flight policy scan", () => {
  const client = new QueryClient();
  client.setQueryData<AdminRatingCatchupStatusResponse>(["admin", "rating-catchup"], {
    observed_at: "2026-11-04T00:00:00Z",
    tenants: [
      { ...empty, tenant_id: "00000000-0000-0000-0000-000000000001", tenant_slug: "low", dirty_runs: 1 },
      { ...empty, tenant_id: "00000000-0000-0000-0000-000000000002", tenant_slug: "high", dirty_renown: 20, unfinished_policy_scan_stages: 2, policy_scan_stages: 6, policy_scan_stage_number: 5 },
    ],
  });
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><AdminRatingCatchup /></QueryClientProvider>);
  expect(markup.indexOf("high")).toBeLessThan(markup.indexOf("low"));
  expect(markup).toMatch(/disabled=""[^>]*>Scan in progress<\/button>/);
  expect(markup).toContain("Start policy scan");
  client.clear();
});
