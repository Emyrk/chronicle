import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { AdminRatingRebuildJob, AdminRatingRebuildJobsResponse } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { cn } from "@/lib/utils";

const LIMIT = 40;
const UNFINISHED = new Set(["available", "pending", "retryable", "running", "scheduled"]);

/** "12m 04s", "1h 03m", "45s". */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

/** The last rating rebuilds from River with their timings; slow ones are raised. */
export function AdminRatingRebuilds() {
  const [slowestFirst, setSlowestFirst] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "rating-rebuilds", LIMIT],
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/leaderboard/rating-rebuilds?limit=${LIMIT}`);
      if (!res.ok) throw new Error(`Rating rebuilds failed (${res.status})`);
      return (await res.json()) as AdminRatingRebuildJobsResponse;
    },
    // Keep a running rebuild's progress fresh; idle lists don't poll.
    refetchInterval: (query) => (query.state.data?.jobs.some((job) => UNFINISHED.has(job.state)) ? 15_000 : false),
  });
  const jobs = [...(data?.jobs ?? [])];
  if (slowestFirst) jobs.sort((a, b) => b.duration_seconds - a.duration_seconds);
  const slow = jobs.filter((job) => job.slow).length;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Recent rating rebuilds</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The last {LIMIT} tenant rebuild jobs from River.
            {data && data.median_seconds > 0 && <> Median finished rebuild: {formatDuration(data.median_seconds)}.</>}
            {slow > 0 && <span className="text-amber-500"> {slow} slow (over twice the median).</span>}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
          <Checkbox checked={slowestFirst} onCheckedChange={(checked) => setSlowestFirst(checked === true)} className="size-3.5" />
          Slowest first
        </label>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p role="alert" className="py-4 text-center text-sm text-destructive">Could not load rating rebuilds.</p>
      ) : jobs.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No rating rebuilds have run yet.</p>
      ) : (
        <div className="styled-scrollbar overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-muted-foreground">
                <th className="py-2 pr-4">Job</th>
                <th className="py-2 pr-4">Tenant</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2 pr-4">Phase</th>
                <th className="py-2 pr-4 text-right">Pages</th>
                <th className="py-2 pr-4 text-right">Pages/s</th>
                <th className="py-2 pr-4">Started</th>
                <th className="py-2 pr-4 text-right">Duration</th>
              </tr>
            </thead>
            <tbody>{jobs.map((job) => <JobRow key={job.id} job={job} />)}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function JobRow({ job }: { job: AdminRatingRebuildJob }) {
  const unfinished = UNFINISHED.has(job.state);
  return (
    <tr className={cn("border-b border-zinc-800/50 align-top", job.slow && "bg-amber-500/[.07]")}>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">#{job.id}</td>
      <td className="py-2 pr-4">{job.tenant_name || (job.tenant_id === "00000000-0000-0000-0000-000000000000" ? "Root" : job.tenant_id)}</td>
      <td className="py-2 pr-4">
        <span className={cn(job.state === "completed" ? "text-green-500" : job.state === "discarded" || job.last_error ? "text-destructive" : "text-muted-foreground")}>
          {job.state}
        </span>
        {job.last_error && <span className="block max-w-72 truncate text-xs text-destructive" title={job.last_error}>{job.last_error}</span>}
      </td>
      <td className="py-2 pr-4 text-muted-foreground">{job.phase || "—"}</td>
      <td className="py-2 pr-4 text-right font-mono text-xs">{job.pages_processed ? job.pages_processed.toLocaleString() : "—"}</td>
      <td className="py-2 pr-4 text-right font-mono text-xs">{job.pages_per_second ? job.pages_per_second.toFixed(1) : "—"}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground" title={job.created_at}>{new Date(job.created_at).toLocaleString()}</td>
      <td className="py-2 pr-4 text-right font-mono text-xs">
        {formatDuration(job.duration_seconds)}
        {unfinished && <span className="text-muted-foreground"> so far</span>}
        {job.slow && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber-500 uppercase">slow</span>}
      </td>
    </tr>
  );
}
