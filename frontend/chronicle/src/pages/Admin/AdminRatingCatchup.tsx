import { useQuery } from "@tanstack/react-query";
import type { AdminRatingCatchupStatusResponse, AdminTenantRatingCatchup } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";

const SERIES = [
  { key: "dirty_runs", label: "Runs", stroke: "#60a5fa" },
  { key: "dirty_renown", label: "Renown", stroke: "#fbbf24" },
  { key: "dirty_mastery", label: "Mastery", stroke: "#a78bfa" },
  { key: "dirty_peak", label: "Peak", stroke: "#34d399" },
] as const;

function oldestAge(row: AdminTenantRatingCatchup): string {
  const oldest = [row.oldest_run, row.oldest_renown, row.oldest_mastery, row.oldest_peak]
    .filter((value): value is string => !!value)
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (!oldest.length) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - Math.min(...oldest)) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function DirtyBars({ row }: { row: AdminTenantRatingCatchup }) {
  const max = Math.max(1, ...SERIES.map(({ key }) => row[key]));
  return (
    <div className="space-y-2" aria-label="Current dirty work by type">
      {SERIES.map(({ key, label, stroke }) => (
        <div key={key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full" style={{ width: `${(row[key] / max) * 100}%`, backgroundColor: stroke }} />
          </div>
          <span className="text-right font-mono tabular-nums">{row[key].toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

const POLICY_STAGES = ["Runs", "Renown", "Mastery", "Peak", "Player scopes", "Guild scopes"];

function ScanProgress({ row }: { row: AdminTenantRatingCatchup }) {
  const completedStages = row.policy_scan_stages - row.unfinished_policy_scan_stages;
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <div>
        <span className="font-medium text-foreground">Historical discovery: </span>
        {row.scan_completed_at ? "Complete"
          : row.scan_source_cutoff ? "In progress or awaiting worker" : "Not started"}
        {!row.scan_completed_at && row.scan_after_run_id &&
          <span className="block font-mono">Last scanned run: {row.scan_after_run_id}</span>}
      </div>
      {row.policy_scan_stages > 0 && (
        <div>
          <span className="font-medium text-foreground">Policy scan: </span>
          {row.unfinished_policy_scan_stages === 0 ? "Complete"
            : `${completedStages} of ${row.policy_scan_stages} stages complete`}
          <div className="mt-1 flex flex-wrap gap-1" aria-label="Policy scan stages">
            {POLICY_STAGES.map((stage, index) => {
              const state = index < completedStages ? "done"
                : index + 1 === row.policy_scan_stage_number ? "current" : "pending";
              return (
                <span key={stage} className={`rounded border px-1.5 py-0.5 ${state === "done" ? "border-emerald-700 text-emerald-400" : state === "current" ? "border-amber-600 text-amber-400" : "border-zinc-700"}`}>
                  {stage} · {state}
                </span>
              );
            })}
          </div>
          {row.unfinished_policy_scan_stages > 0 && <span className="mt-1 block">Stage progress is not measured by run count.</span>}
        </div>
      )}
    </div>
  );
}

function TenantCatchup({ row }: { row: AdminTenantRatingCatchup }) {
  const dirty = row.dirty_runs + row.dirty_renown + row.dirty_mastery + row.dirty_peak;
  return (
    <div className="grid gap-3 border-t border-zinc-800 py-4 first:border-0 md:grid-cols-[minmax(9rem,1fr)_minmax(15rem,2fr)]">
      <div>
        <div className="break-all font-mono text-xs">{row.tenant_id === "00000000-0000-0000-0000-000000000000" ? "Root" : row.tenant_id}</div>
        <div className="mt-1 text-xs text-muted-foreground">{row.status.replaceAll("_", " ")} · {dirty.toLocaleString()} dirty · oldest {oldestAge(row)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{row.peak_pages} Peak pages · {row.active_drain_jobs} active drain jobs</div>
        <div className="mt-1 text-xs text-muted-foreground">Projection: {row.read_state} · {row.job_kind ?? "Job"}: {row.job_state ?? "not queued"}{row.last_succeeded_at ? ` · last finished ${new Date(row.last_succeeded_at).toLocaleString()}` : ""}</div>
        <div className="mt-3"><ScanProgress row={row} /></div>
        {row.job_last_error && <p role="alert" className="mt-1 break-words text-xs text-destructive">{row.job_last_error}</p>}
      </div>
      <DirtyBars row={row} />
    </div>
  );
}

/** Current dirty work by tenant; Prometheus owns historical trends. */
export function AdminRatingCatchup() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "rating-catchup"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/ratings/catchup");
      if (!res.ok) throw new Error(`Rating catch-up failed (${res.status})`);
      return await res.json() as AdminRatingCatchupStatusResponse;
    },
    refetchInterval: 15_000,
    retry: false,
  });
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-semibold">Rating catch-up</h3>
        <p className="mt-1 text-xs text-muted-foreground">Current dirty work by tenant. Bars refresh every 15 seconds; longer-term trends live in Prometheus.</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading dirty queues…</p>
        : isError ? <p role="alert" className="text-sm text-destructive">Could not load rating catch-up.</p>
          : data?.tenants.length ? data.tenants.map((row) => <TenantCatchup key={row.tenant_id} row={row} />)
            : <p className="text-sm text-muted-foreground">No rating tenants found.</p>}
    </Card>
  );
}
