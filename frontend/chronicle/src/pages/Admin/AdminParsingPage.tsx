import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminRankingsRefreshStatusResponse,
  AdminRefreshRankingsResponse,
  AdminSnapshotSummary,
  AdminTimeParseSnapshotSummary,
  AdminTriggerSnapshotResponse,
} from "@/api/typesGenerated";
import { Loader2, Camera, RefreshCw, Trash2 } from "lucide-react";
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

function formatCutoffDate(iso: string) {
  if (!iso || iso.startsWith("0001")) return "—";
  return iso.slice(0, 10);
}

function formatLookback(days: number) {
  return days === 0 ? "all-time" : `${days}d`;
}

// ── Tab types ───────────────────────────────────────────────────────────

type TabKey = "dps-hps" | "time";

const TABS: { key: TabKey; label: string }[] = [
  { key: "dps-hps", label: "DPS / HPS" },
  { key: "time", label: "Clear / Kill Time" },
];

// ── Page shell ──────────────────────────────────────────────────────────

export function AdminParsingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("dps-hps");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dps-hps" && <DpsHpsTab />}
      {activeTab === "time" && <TimeParseTab />}
    </div>
  );
}

// ── Snapshot creation controls (shared between tabs) ────────────────────

function SnapshotCreateControls({
  endpoint,
  queryKeyToInvalidate,
  description,
}: {
  endpoint: string;
  queryKeyToInvalidate: readonly string[];
  description: string;
}) {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [lookbackDays, setLookbackDays] = useState(60);
  const [allTenants, setAllTenants] = useState(true);
  const [tenantId, setTenantId] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          lookback_days: lookbackDays,
          all_tenants: allTenants,
          tenant_id: allTenants ? "" : tenantId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).message ?? "Failed to create snapshot",
        );
      }
      return res.json() as Promise<AdminTriggerSnapshotResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeyToInvalidate] });
    },
  });

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Create Snapshot</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      <div className="flex items-end gap-3 mb-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Cutoff Date (UTC)</label>
          <input
            type="date"
            className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <div className="w-32">
          <label className="text-xs text-muted-foreground">Lookback Days</label>
          <input
            type="number"
            className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            min={0}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allTenants}
            onChange={(e) => setAllTenants(e.target.checked)}
            className="rounded border-zinc-700"
          />
          All tenants
        </label>
        {!allTenants && (
          <div className="flex-1">
            <input
              type="text"
              placeholder="Tenant UUID (empty = root only)"
              className="w-full px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>
        )}
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !day}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Camera className="h-4 w-4 mr-1" />
              Create Snapshot
            </>
          )}
        </Button>
      </div>
      {createMutation.isSuccess && createMutation.data.jobs.length > 0 && (
        <div className="text-sm text-green-500 space-y-1">
          <p>Enqueued {createMutation.data.jobs.length} job(s):</p>
          <ul className="list-disc list-inside text-xs font-mono">
            {createMutation.data.jobs.map((job) => (
              <li key={job.job_id}>
                tenant={job.tenant_id === "00000000-0000-0000-0000-000000000000" ? "root" : job.tenant_id}{" "}
                lookback={job.lookback_days}d job={job.job_id} ({job.job_state})
              </li>
            ))}
          </ul>
        </div>
      )}
      {createMutation.isError && (
        <p className="text-sm text-red-500">
          {createMutation.error instanceof Error
            ? createMutation.error.message
            : "Failed to create snapshot"}
        </p>
      )}
    </Card>
  );
}

// ── DPS / HPS Tab ───────────────────────────────────────────────────────

function DpsHpsTab() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    data: snapshots,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin", "parses", "snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/parses/snapshots");
      if (!res.ok) throw new Error("Failed to fetch snapshots");
      return res.json() as Promise<AdminSnapshotSummary[]>;
    },
    retry: false,
  });

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

  const deleteMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await fetch(`/api/v1/admin/parses/snapshots/${snapshotId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).message ?? "Failed to delete snapshot",
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "parses", "snapshots"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/v1/admin/parses/snapshots/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).message ?? "Failed to delete snapshots",
        );
      }
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin", "parses", "snapshots"] });
    },
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

  const allSelected = useMemo(
    () =>
      !!snapshots && snapshots.length > 0 && snapshots.every((s) => selectedIds.has(s.id)),
    [snapshots, selectedIds],
  );

  const toggleAll = useCallback(() => {
    if (!snapshots) return;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(snapshots.map((s) => s.id)));
    }
  }, [snapshots, allSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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

      <SnapshotCreateControls
        endpoint="/api/v1/admin/parses/snapshot"
        queryKeyToInvalidate={["admin", "parses", "snapshots"]}
        description="Trigger a DPS/HPS parse snapshot for a specific day. The snapshot window is [cutoff − lookback, cutoff), so a backfilled snapshot contains only kills before that day. No-op if that day's snapshot already exists."
      />

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Published Snapshots</h3>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${selectedIds.size} snapshot(s)? Members will be cascade-deleted. Affected raids will fall back to the previous snapshot.`,
                    )
                  ) {
                    bulkDeleteMutation.mutate([...selectedIds]);
                  }
                }}
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : snapshots && snapshots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-muted-foreground text-left">
                  <th className="py-2 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-zinc-700"
                    />
                  </th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Cutoff</th>
                  <th className="py-2 pr-4">Lookback</th>
                  <th className="py-2 pr-4">Cohort</th>
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Published</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(snap.id)}
                        onChange={() => toggleOne(snap.id)}
                        className="rounded border-zinc-700"
                      />
                    </td>
                    <td className="py-2 pr-4 text-xs">{snap.tenant_name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatCutoffDate(snap.cutoff)}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {formatLookback(snap.lookback_days)}
                    </td>
                    <td className="py-2 pr-4 text-xs">{snap.cohort_mode}</td>
                    <td className="py-2 pr-4">
                      <span className="text-xs text-muted-foreground">
                        p{snap.policy_version}/q{snap.query_version}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          snap.status === "published"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {snap.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {snap.published_at ? formatDate(snap.published_at) : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete snapshot ${snap.id}? Members will be cascade-deleted. Raids from this day will fall back to the previous snapshot.`,
                            )
                          ) {
                            deleteMutation.mutate(snap.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No snapshots found. Create one to get started.
          </p>
        )}
        {(deleteMutation.isError || bulkDeleteMutation.isError) && (
          <p className="text-sm text-red-500 mt-2">
            {(deleteMutation.error ?? bulkDeleteMutation.error) instanceof Error
              ? ((deleteMutation.error ?? bulkDeleteMutation.error) as Error).message
              : "Failed to delete snapshot(s)"}
          </p>
        )}
      </Card>
    </div>
  );
}

// ── Clear / Kill Time Tab ───────────────────────────────────────────────

function TimeParseTab() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    data: snapshots,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin", "parses", "time-parse-snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/parses/time-parse-snapshots");
      if (!res.ok) throw new Error("Failed to fetch time-parse snapshots");
      return res.json() as Promise<AdminTimeParseSnapshotSummary[]>;
    },
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await fetch(
        `/api/v1/admin/parses/time-parse-snapshots/${snapshotId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).message ?? "Failed to delete snapshot",
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "parses", "time-parse-snapshots"],
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/v1/admin/parses/time-parse-snapshots/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).message ?? "Failed to delete snapshots",
        );
      }
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["admin", "parses", "time-parse-snapshots"],
      });
    },
  });

  const allSelected = useMemo(
    () =>
      !!snapshots &&
      snapshots.length > 0 &&
      snapshots.every((s) => selectedIds.has(s.id)),
    [snapshots, selectedIds],
  );

  const toggleAll = useCallback(() => {
    if (!snapshots) return;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(snapshots.map((s) => s.id)));
    }
  }, [snapshots, allSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      <SnapshotCreateControls
        endpoint="/api/v1/admin/parses/time-parse-snapshot"
        queryKeyToInvalidate={["admin", "parses", "time-parse-snapshots"]}
        description="Trigger a clear/kill-time snapshot for a specific day. Populates clear-time and boss-kill cohorts for percentile scoring. No-op if that day's snapshot already exists."
      />

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Time-Parse Snapshots</h3>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${selectedIds.size} time-parse snapshot(s)? Members will be cascade-deleted.`,
                    )
                  ) {
                    bulkDeleteMutation.mutate([...selectedIds]);
                  }
                }}
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-500 text-center py-4">
            {error instanceof Error ? error.message : "Failed to load snapshots"}
          </p>
        ) : snapshots && snapshots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-muted-foreground text-left">
                  <th className="py-2 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-zinc-700"
                    />
                  </th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Cutoff</th>
                  <th className="py-2 pr-4">Lookback</th>
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Clears</th>
                  <th className="py-2 pr-4">Bosses</th>
                  <th className="py-2 pr-4">Src Rows</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Published</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(snap.id)}
                        onChange={() => toggleOne(snap.id)}
                        className="rounded border-zinc-700"
                      />
                    </td>
                    <td className="py-2 pr-4 text-xs">{snap.tenant_name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatCutoffDate(snap.cutoff)}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {formatLookback(snap.lookback_days)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs text-muted-foreground">
                        p{snap.policy_version}/q{snap.query_version}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {snap.clear_member_count.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {snap.boss_member_count.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {snap.source_row_count.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          snap.status === "published"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {snap.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {snap.published_at ? formatDate(snap.published_at) : "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatDate(snap.created_at)}
                    </td>
                    <td className="py-2 pr-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete time-parse snapshot ${snap.id}? Members will be cascade-deleted.`,
                            )
                          ) {
                            deleteMutation.mutate(snap.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No time-parse snapshots found. Create one to get started.
          </p>
        )}
        {(deleteMutation.isError || bulkDeleteMutation.isError) && (
          <p className="text-sm text-red-500 mt-2">
            {(deleteMutation.error ?? bulkDeleteMutation.error) instanceof Error
              ? ((deleteMutation.error ?? bulkDeleteMutation.error) as Error).message
              : "Failed to delete snapshot(s)"}
          </p>
        )}
      </Card>
    </div>
  );
}
