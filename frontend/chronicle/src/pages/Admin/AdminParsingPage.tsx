import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminSnapshotSummary,
  AdminTriggerSnapshotResponse,
} from "@/api/typesGenerated";
import { Loader2, Camera } from "lucide-react";
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/admin/parses/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          lookback_days: lookbackDays,
          tenant_id: "",
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
        <div className="flex items-end gap-3 mb-4">
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
        {createMutation.isSuccess && (
          <p className="text-sm text-green-500">
            Job enqueued (ID: {createMutation.data.job_id}, state:{" "}
            {createMutation.data.job_state})
          </p>
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
      </Card>
    </div>
  );
}
