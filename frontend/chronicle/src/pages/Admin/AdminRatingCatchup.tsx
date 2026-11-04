import { useQuery } from "@tanstack/react-query";
import type { AdminRatingCatchupStatusResponse, AdminTenantRatingCatchup } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";

const SERIES = [
  { key: "dirty_runs", label: "Runs", stroke: "#60a5fa" },
  { key: "dirty_renown", label: "Renown", stroke: "#fbbf24" },
  { key: "dirty_mastery", label: "Mastery", stroke: "#a78bfa" },
  { key: "dirty_peak", label: "Peak", stroke: "#34d399" },
] as const;
type DirtyKey = (typeof SERIES)[number]["key"];
type Sample = { counts: Record<DirtyKey, number> };

// This module is reloaded with the page; only Prometheus retains history.
const sampleHistory = new Map<string, Sample[]>();

function trackSnapshot(snapshot: AdminRatingCatchupStatusResponse): AdminRatingCatchupStatusResponse {
  for (const row of snapshot.tenants) {
    const old = sampleHistory.get(row.tenant_id) ?? [];
    sampleHistory.set(row.tenant_id, [...old.slice(-59), {
      counts: {
        dirty_runs: row.dirty_runs, dirty_renown: row.dirty_renown,
        dirty_mastery: row.dirty_mastery, dirty_peak: row.dirty_peak,
      },
    }]);
  }
  return snapshot;
}

function oldestAge(row: AdminTenantRatingCatchup): string {
  const oldest = [row.oldest_run, row.oldest_renown, row.oldest_mastery, row.oldest_peak]
    .filter((value): value is string => !!value)
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (!oldest.length) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - Math.min(...oldest)) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function DirtyTrend({ samples }: { samples: Sample[] }) {
  if (!samples.length) return null;
  const max = Math.max(1, ...samples.flatMap((sample) => SERIES.map(({ key }) => sample.counts[key])));
  const path = (key: DirtyKey) => samples.map((sample, index) => {
    const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * 100;
    return `${index ? "L" : "M"}${x.toFixed(2)} ${(100 - (sample.counts[key] / max) * 100).toFixed(2)}`;
  }).join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full rounded border border-zinc-800 bg-zinc-950/50" role="img" aria-label="Dirty queue sizes since this page opened">
        {SERIES.map(({ key, stroke }) => <path key={key} d={path(key)} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {SERIES.map(({ key, label, stroke }) => <span key={key}><span aria-hidden="true" style={{ color: stroke }}>●</span> {label}</span>)}
        <span>Since page opened · max {max.toLocaleString()}</span>
      </div>
    </div>
  );
}

function TenantCatchup({ row, samples }: { row: AdminTenantRatingCatchup; samples: Sample[] }) {
  const dirty = row.dirty_runs + row.dirty_renown + row.dirty_mastery + row.dirty_peak;
  return (
    <div className="grid gap-3 border-t border-zinc-800 py-4 first:border-0 md:grid-cols-[minmax(9rem,1fr)_minmax(15rem,2fr)]">
      <div>
        <div className="break-all font-mono text-xs">{row.tenant_id === "00000000-0000-0000-0000-000000000000" ? "Root" : row.tenant_id}</div>
        <div className="mt-1 text-xs text-muted-foreground">{row.status.replaceAll("_", " ")} · {dirty.toLocaleString()} dirty · oldest {oldestAge(row)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{row.scan_completed_at ? "Historical scan complete" : row.scan_source_cutoff ? "Historical scan running" : "Historical scan not started"} · {row.peak_pages} Peak pages</div>
        <div className="mt-1 text-xs text-muted-foreground">Projection: {row.read_state} · Drain: {row.job_state ?? "not queued"}{row.last_succeeded_at ? ` · last finished ${new Date(row.last_succeeded_at).toLocaleString()}` : ""}</div>
        {row.job_last_error && <p role="alert" className="mt-1 break-words text-xs text-destructive">{row.job_last_error}</p>}
      </div>
      <DirtyTrend samples={samples} />
    </div>
  );
}

/** An in-memory trace of DB snapshots; Prometheus owns longer-term history. */
export function AdminRatingCatchup() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "rating-catchup"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/ratings/catchup");
      if (!res.ok) throw new Error(`Rating catch-up failed (${res.status})`);
      return trackSnapshot(await res.json() as AdminRatingCatchupStatusResponse);
    },
    refetchInterval: 15_000,
    retry: false,
  });
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-semibold">Rating catch-up</h3>
        <p className="mt-1 text-xs text-muted-foreground">Current dirty work by tenant. Trends are sampled while this page is open; a reload starts a new trace.</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading dirty queues…</p>
        : isError ? <p role="alert" className="text-sm text-destructive">Could not load rating catch-up.</p>
          : data?.tenants.length ? data.tenants.map((row) => <TenantCatchup key={row.tenant_id} row={row} samples={sampleHistory.get(row.tenant_id) ?? []} />)
            : <p className="text-sm text-muted-foreground">No rating tenants found.</p>}
    </Card>
  );
}
