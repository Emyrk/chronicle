import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import {
  operationJSON,
  type LeaderboardMaintenanceResponse,
} from "@/api/leaderboardOperations";

export function LeaderboardMaintenanceNotice({
  tenantID,
}: {
  tenantID?: string;
}) {
  const status = useQuery({
    queryKey: ["leaderboard-maintenance", tenantID],
    queryFn: () =>
      operationJSON<LeaderboardMaintenanceResponse>(
        "/api/v1/leaderboards-v2/maintenance",
      ),
    enabled: !!tenantID,
    refetchInterval: 30_000,
    staleTime: 0,
    retry: false,
  });
  if (!tenantID) return null;
  const notice = status.data?.maintenance;
  // React Query retains the last successful value on refresh failure. Never
  // clear a known active notice because a request failed or a phase paused.
  if (!notice && !status.isError) return null;
  return (
    <section
      role="status"
      aria-label="Leaderboard maintenance"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <Info
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-amber-500"
      />
      <div className="min-w-0 space-y-1">
        {notice && (
          <>
            <p className="font-medium">
              {notice.kind === "partial_coverage"
                ? "Historical leaderboard coverage is incomplete"
                : notice.kind === "repair_in_progress"
                  ? "Leaderboard results are being recalculated"
                  : "Leaderboard maintenance"}
            </p>
            <p>{notice.message}</p>
            <p className="text-xs text-muted-foreground">
              Status: {notice.state} · Runs completed before{" "}
              {notice.before_date} 00:00 UTC (exclusive). Undated runs are not
              included in date scans.
            </p>
            {notice.missing_dates > 0 && (
              <p className="text-xs text-muted-foreground">
                {notice.missing_dates.toLocaleString()} runs without completion
                dates require separate repair; date-based coverage excludes
                them.
              </p>
            )}
          </>
        )}
        {status.isError && (
          <p className="text-xs text-muted-foreground">
            Maintenance status could not be refreshed.
            {notice
              ? " The last known maintenance notice is still shown."
              : " Current maintenance status is unknown."}
          </p>
        )}
      </div>
    </section>
  );
}
