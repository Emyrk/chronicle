import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAdminTenants } from "@/api/queries";
import {
  operationActive,
  operationPhaseDescription,
  utcToday,
  useLeaderboardOperationAction,
  useLeaderboardOperations,
  useLeaderboardOperationDetail,
  type LeaderboardOperation,
} from "@/api/leaderboardOperations";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().replace("T", " ").replace(".000Z", " UTC")
    : value;
}
export function OperationSummary({
  operation,
}: {
  operation: LeaderboardOperation;
}) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">
          {operation.state} · {operation.phase}
        </span>{" "}
        · {operation.discovered.toLocaleString()} obligations / keys discovered
      </p>
      <p>{operationPhaseDescription(operation)}</p>
      <p>
        {operation.state === "completed"
          ? "Discovery and pending tenant processing for this operation are complete."
          : operation.discovery_complete
            ? "Discovery finished. Completion waits for all pending tenant processing."
            : "Historical discovery is not complete."}
      </p>
      {operation.state === "paused" && (
        <p>Discovery paused. Already queued D1/D2 processing continues.</p>
      )}
      <p>
        Last progress: {dateTime(operation.last_progress_at)} · Retries:{" "}
        {operation.retry_count}
      </p>
      {operation.missing_dates > 0 && (
        <p className="text-amber-600 dark:text-amber-400">
          {operation.missing_dates.toLocaleString()} runs have no completion
          date and are not covered by date scans. Use single-run repair for
          those runs.
        </p>
      )}
      {operation.backlog && (
        <div
          className="space-y-1 rounded border p-2"
          aria-label="Current tenant processing backlog"
        >
          <p className="font-medium text-foreground">
            Current tenant backlog (includes other queued work)
          </p>
          <p>
            D1 pending: {operation.backlog.d1_pending.toLocaleString()} · D2
            pending: {operation.backlog.d2_pending.toLocaleString()}
          </p>
          <p>
            Pending retries:{" "}
            {operation.backlog.pending_retries.toLocaleString()} · Oldest
            pending: {dateTime(operation.backlog.oldest_pending_at)}
          </p>
        </div>
      )}
      {operation.last_error && (
        <p role="alert" className="break-words text-destructive">
          {operation.last_error}
        </p>
      )}
    </div>
  );
}
export function TenantLeaderboardOperations({
  tenantID,
  tenantName,
}: {
  tenantID: string;
  tenantName: string;
}) {
  const [beforeDate, setBeforeDate] = useState(utcToday);
  const [runID, setRunID] = useState("");
  const operations = useLeaderboardOperations(tenantID);
  const action = useLeaderboardOperationAction(tenantID);
  const rows = [...(operations.data?.operations ?? [])].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  );
  const activeSummary = rows.find(operationActive);
  const detail = useLeaderboardOperationDetail(tenantID, activeSummary?.id);
  const active =
    detail.data?.id === activeSummary?.id ? detail.data : activeSummary;
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{tenantName}</h3>
          <p className="text-xs text-muted-foreground">
            Historical leaderboard operations for this tenant only.
          </p>
        </div>
        {operations.isFetching && (
          <Loader2
            aria-label={`Refreshing ${tenantName} operations`}
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block">Runs completed before</span>
          <input
            aria-label={`${tenantName} completion cutoff date`}
            type="date"
            max={utcToday()}
            required
            value={beforeDate}
            onChange={(event) => setBeforeDate(event.target.value)}
            className="h-9 rounded-md border bg-background px-3"
          />
        </label>
        <span className="pb-2 text-xs text-muted-foreground">
          00:00 UTC (exclusive)
        </span>
        <Button
          disabled={
            !beforeDate ||
            action.isPending ||
            !!active ||
            operations.isPending ||
            operations.isError
          }
          onClick={() =>
            action.mutate({
              tenant_id: tenantID,
              purpose: "bootstrap",
              scope: "tenant",
              before_date: beforeDate,
            })
          }
        >
          Backfill {tenantName}
        </Button>
        <Button
          variant="outline"
          disabled={
            !beforeDate ||
            action.isPending ||
            !!active ||
            operations.isPending ||
            operations.isError
          }
          onClick={() =>
            action.mutate({
              tenant_id: tenantID,
              purpose: "repair",
              scope: "tenant",
              before_date: beforeDate,
            })
          }
        >
          Repair tenant
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Uses run completion time, not upload time. Runs without a completion
        date are not covered by a date scan. The cutoff is not an ingestion
        snapshot.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 space-y-1 text-sm">
          <span className="block">Single-run repair</span>
          <input
            aria-label={`${tenantName} run ID`}
            placeholder="Run UUID"
            value={runID}
            onChange={(event) => setRunID(event.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 font-mono text-xs"
          />
        </label>
        <Button
          variant="outline"
          disabled={
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              runID.trim(),
            ) ||
            action.isPending ||
            !!active ||
            operations.isPending ||
            operations.isError
          }
          onClick={() =>
            action.mutate({
              tenant_id: tenantID,
              purpose: "repair",
              scope: "run",
              run_id: runID.trim(),
            })
          }
        >
          Repair run
        </Button>
      </div>
      {action.isError && (
        <p role="alert" className="text-sm text-destructive">
          {action.error.message}
        </p>
      )}
      {operations.isError && (
        <p role="alert" className="text-sm text-destructive">
          {operations.error.message}
        </p>
      )}
      {active && (
        <div className="space-y-2 rounded-md border p-3">
          <OperationSummary operation={active} />
          {detail.isPending && (
            <p role="status" className="text-xs text-muted-foreground">
              Loading current tenant backlog…
            </p>
          )}
          {detail.isError && (
            <p role="alert" className="text-xs text-destructive">
              Could not refresh current tenant backlog. {detail.error.message}
            </p>
          )}
          {(active.state === "paused" ||
            (!active.discovery_complete && active.state === "discovering")) && (
            <Button
              variant="outline"
              size="sm"
              disabled={action.isPending}
              onClick={() =>
                action.mutate({
                  id: active.id,
                  action: active.state === "paused" ? "resume" : "pause",
                })
              }
            >
              {active.state === "paused"
                ? "Resume discovery"
                : "Pause discovery"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Pausing stops discovery only; queued processing continues. The
            leaderboard notice remains until completion.
          </p>
        </div>
      )}
      <details open={rows.length === 0}>
        <summary className="cursor-pointer text-sm font-medium">
          Recent operation history ({rows.length}, latest 50)
          {rows[0] &&
            ` · latest ${rows[0].state}${rows[0].completed_at ? ` · completed ${dateTime(rows[0].completed_at)}` : ""}`}
        </summary>
        {operations.isPending ? (
          <p role="status" className="py-3 text-sm text-muted-foreground">
            Loading operation history…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No operations recorded.
          </p>
        ) : (
          <div className="styled-scrollbar mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  {[
                    "Operation / scope",
                    "Run discovery before",
                    "Progress",
                    "Audit",
                  ].map((label) => (
                    <th key={label} className="px-2 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((operation) => (
                  <tr key={operation.id} className="border-b align-top">
                    <td className="space-y-1 px-2 py-3">
                      <p>
                        {operation.purpose === "bootstrap"
                          ? "Backfill"
                          : "Repair"}{" "}
                        · {operation.scope}
                      </p>
                      <p className="font-mono">{operation.id}</p>
                      {operation.run_id && (
                        <p className="font-mono">Run {operation.run_id}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {operation.scope === "run"
                        ? "Single run"
                        : `${operation.before_date} 00:00 UTC (exclusive)`}
                    </td>
                    <td className="min-w-64 px-2 py-3">
                      <OperationSummary operation={operation} />
                    </td>
                    <td className="space-y-1 whitespace-nowrap px-2 py-3">
                      <p>Started: {dateTime(operation.started_at)}</p>
                      <p>Completed: {dateTime(operation.completed_at)}</p>
                      <p>Requested by: {operation.requested_by}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </Card>
  );
}
export function AdminLeaderboardOperations() {
  const tenants = useAdminTenants();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Leaderboard operations</h2>
        <p className="text-sm text-muted-foreground">
          Backfill historical runs or repair existing results. Discovery and
          queued processing are separate phases.
        </p>
      </div>
      {tenants.isPending ? (
        <p role="status">Loading tenants…</p>
      ) : tenants.isError ? (
        <p role="alert" className="text-destructive">
          {tenants.error.message}
        </p>
      ) : (
        tenants.data?.map((tenant) => (
          <TenantLeaderboardOperations
            key={tenant.id}
            tenantID={tenant.id}
            tenantName={tenant.name}
          />
        ))
      )}
    </div>
  );
}
