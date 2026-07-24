import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminSnapshotSummary,
  AdminTriggerSnapshotResponse,
} from "@/api/typesGenerated";
import { Loader2, Camera, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

export function AdminParsingPage() {
  const queryClient = useQueryClient();

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

  const [day, setDay] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [lookbackDays, setLookbackDays] = useState(60);
  const [allTenants, setAllTenants] = useState(true);
  const [tenantId, setTenantId] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/admin/parses/snapshot", {
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
      queryClient.invalidateQueries({ queryKey: ["admin", "parses", "snapshots"] });
    },
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

  const formatDate = (iso: string) => {
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
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Create Parse Snapshot</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Trigger a parse snapshot for a specific day. The snapshot window is [cutoff −
          lookback, cutoff), so a backfilled snapshot contains only kills before that
          day. No-op if that day's snapshot already exists.
        </p>
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

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Published Snapshots</h3>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
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
                  <th className="py-2 pr-4">Cutoff</th>
                  <th className="py-2 pr-4">Lookback</th>
                  <th className="py-2 pr-4">Cohort</th>
                  <th className="py-2 pr-4">Members</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Published</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatDate(snap.cutoff)}
                    </td>
                    <td className="py-2 pr-4">
                      {snap.lookback_days === 0 ? "all-time" : `${snap.lookback_days}d`}
                    </td>
                    <td className="py-2 pr-4">{snap.cohort_mode}</td>
                    <td className="py-2 pr-4 font-mono">
                      {snap.member_count.toLocaleString()}
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
        {deleteMutation.isError && (
          <p className="text-sm text-red-500 mt-2">
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "Failed to delete snapshot"}
          </p>
        )}
      </Card>
    </div>
  );
}
