import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminBackfillTimeParseScoresResponse,
  AdminRankingsRefreshStatusResponse,
  AdminRefreshRankingsResponse,
} from "@/api/typesGenerated";
import { Loader2, DatabaseZap, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

// ── Shared helpers ──────────────────────────────────────────────────────

function formatDate(iso: string) {
  if (!iso || iso.startsWith("0001")) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

// ── Page shell ──────────────────────────────────────────────────────────

export function AdminParsingPage() {
  return <DpsHpsTab />;
}

// ── Locked time-parse score backfill ────────────────────────────────────

function TimeParseBackfillControls() {
  const [tenantId, setTenantId] = useState("");
  const [startedAfter, setStartedAfter] = useState("");
  const [startedBefore, setStartedBefore] = useState("");
  const [batchSize, setBatchSize] = useState(100);
  const [force, setForce] = useState(false);

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/admin/parses/time-scores/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId.trim(),
          started_after: startedAfter ? `${startedAfter}T00:00:00Z` : "",
          started_before: startedBefore ? `${startedBefore}T00:00:00Z` : "",
          batch_size: batchSize,
          force,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).detail ??
            (body as Record<string, string>).message ??
            "Failed to enqueue time parse backfill",
        );
      }
      return res.json() as Promise<AdminBackfillTimeParseScoresResponse>;
    },
  });

  const invalidDateRange =
    startedAfter !== "" &&
    startedBefore !== "" &&
    startedAfter >= startedBefore;
  const invalidBatchSize = batchSize < 1 || batchSize > 500;

  const enqueue = () => {
    if (
      force &&
      !window.confirm(
        "Force recompute replaces existing locked scores in the selected range. Continue?",
      )
    ) {
      return;
    }
    backfillMutation.mutate();
  };

  return (
    <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-zinc-950 via-zinc-950 to-amber-950/20">
      <div className="border-b border-amber-500/15 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-amber-500/10 p-2 text-amber-400">
            <DatabaseZap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold">Locked Time Parse Backfill</h3>
            <p className="text-xs text-muted-foreground">
              Dispatch historical clear and boss score jobs. Each run processes
              one bounded batch.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs text-muted-foreground xl:col-span-2">
            Tenant UUID
            <input
              type="text"
              placeholder="Blank = all tenants"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-foreground"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Instance started on or after
            <input
              type="date"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-foreground"
              value={startedAfter}
              onChange={(event) => setStartedAfter(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Instance started before
            <input
              type="date"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-foreground"
              value={startedBefore}
              onChange={(event) => setStartedBefore(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Batch size
            <input
              type="number"
              min={1}
              max={500}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-foreground"
              value={batchSize}
              onChange={(event) => setBatchSize(Number(event.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 self-end rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="rounded border-zinc-700"
            />
            Force recompute existing scores
          </label>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={enqueue}
              disabled={
                backfillMutation.isPending || invalidDateRange || invalidBatchSize
              }
            >
              {backfillMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <DatabaseZap className="mr-2 h-4 w-4" />
              )}
              Enqueue Backfill Batch
            </Button>
          </div>
        </div>

        {invalidDateRange && (
          <p className="text-sm text-red-400">
            The start date must be before the end date.
          </p>
        )}
        {invalidBatchSize && (
          <p className="text-sm text-red-400">
            Batch size must be between 1 and 500.
          </p>
        )}
        {backfillMutation.isSuccess && (
          <div className="rounded border border-green-500/20 bg-green-500/5 px-3 py-2 text-sm text-green-400">
            Dispatcher job{" "}
            <span className="font-mono">#{backfillMutation.data.job_id}</span>{" "}
            was enqueued in state{" "}
            <span className="font-mono">{backfillMutation.data.job_state}</span>
            . Run another batch after it completes if its River output reports
            rerun=true.
          </div>
        )}
        {backfillMutation.isError && (
          <p className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {backfillMutation.error instanceof Error
              ? backfillMutation.error.message
              : "Failed to enqueue time parse backfill"}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Blank tenant and date filters target all eligible history.
          Missing-only runs skip existing scores. Every instance is scored at
          its own start timestamp against the preceding 60 days of cohort data.
        </p>
      </div>
    </Card>
  );
}

// ── DPS / HPS Tab ───────────────────────────────────────────────────────

function DpsHpsTab() {
  const queryClient = useQueryClient();
  const {
    data: rankingsStatus,
    isLoading: rankingsStatusLoading,
    isError: rankingsStatusError,
    isFetching: rankingsStatusFetching,
    refetch: refetchRankingsStatus,
  } = useQuery({
    queryKey: ["admin", "parses", "rankings", "status"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/parses/rankings/status");
      if (!res.ok) throw new Error("Failed to fetch rankings status");
      return res.json() as Promise<AdminRankingsRefreshStatusResponse>;
    },
    retry: false,
    refetchInterval: 15_000,
  });

  const refreshRankingsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/admin/parses/rankings/refresh", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).message ?? "Failed to refresh rankings",
        );
      }
      return res.json() as Promise<AdminRefreshRankingsResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "parses", "rankings", "status"],
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Rankings Summaries</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Rebuild rankings summary cards for the root site and every tenant. This also
              removes summaries that no longer have eligible ranking rows.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchRankingsStatus()}
              disabled={rankingsStatusFetching}
            >
              {rankingsStatusFetching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh Status
            </Button>
            <Button
              size="sm"
              onClick={() => refreshRankingsMutation.mutate()}
              disabled={refreshRankingsMutation.isPending}
            >
              {refreshRankingsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Force Refresh Rankings
            </Button>
          </div>
        </div>
        {refreshRankingsMutation.isSuccess && (
          <p className="mt-3 text-sm text-green-500">
            Enqueued {refreshRankingsMutation.data.jobs.length} rankings refresh job(s).
          </p>
        )}
        {refreshRankingsMutation.isError && (
          <p className="mt-3 text-sm text-red-500">
            {refreshRankingsMutation.error instanceof Error
              ? refreshRankingsMutation.error.message
              : "Failed to refresh rankings"}
          </p>
        )}

        <div className="mt-4 border-t border-zinc-800 pt-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Automatically checked hourly. Current rows are compared with the counts stored on all
            summary cards; this status refreshes every 15 seconds.
          </p>
          {rankingsStatusLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rankingsStatusError ? (
            <p className="text-sm text-red-500">Failed to load rankings refresh status.</p>
          ) : rankingsStatus && rankingsStatus.tenants.length > 0 ? (
            <div className="styled-scrollbar overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-muted-foreground">
                    <th className="py-2 pr-4">Tenant</th>
                    <th className="py-2 pr-4">Latest summary rebuild</th>
                    <th className="py-2 pr-4">Rows (current / rebuilt)</th>
                    <th className="py-2 pr-4">Summaries</th>
                    <th className="py-2 pr-4">Query version</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingsStatus.tenants.map((tenant) => {
                    const hasData = tenant.current_row_count > 0 || tenant.summary_count > 0;
                    const rebuiltRows =
                      tenant.min_last_row_count === tenant.max_last_row_count
                        ? tenant.max_last_row_count.toLocaleString()
                        : `${tenant.min_last_row_count.toLocaleString()}–${tenant.max_last_row_count.toLocaleString()}`;
                    return (
                      <tr key={tenant.tenant_id} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-4">
                          <div className="text-xs font-medium">{tenant.tenant_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {tenant.tenant_id}
                          </div>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">
                          {tenant.last_rebuilt_at ? formatDate(tenant.last_rebuilt_at) : "Never"}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">
                          {tenant.current_row_count.toLocaleString()} / {rebuiltRows}
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {tenant.summary_count.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">
                          {tenant.stored_query_version} / {tenant.current_query_version}
                        </td>
                        <td className="py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              tenant.refresh_needed
                                ? "bg-yellow-500/10 text-yellow-400"
                                : hasData
                                  ? "bg-green-500/10 text-green-400"
                                  : "bg-zinc-500/10 text-zinc-400"
                            }`}
                          >
                            {tenant.refresh_needed ? "Refresh needed" : hasData ? "Current" : "No data"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tenant status is available.</p>
          )}
        </div>
      </Card>

      <TimeParseBackfillControls />
    </div>
  );
}
