import { AdminLeaderboardHighlights } from "./AdminLeaderboardHighlights";
import { useState, type ReactNode } from "react";
import { useQueries, type UseQueryOptions } from "@tanstack/react-query";
import { AdminLeaderboardQueues } from "./AdminLeaderboardQueues";
import { Loader2 } from "lucide-react";
import { useAdminTenants } from "@/api/queries";
import type { LeaderboardOperationList, Tenant } from "@/api/typesGenerated";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchLeaderboardOperations,
  operationActive,
  operationKey,
  operationPhaseDescription,
  sortedOperations,
  utcTomorrow,
  useLeaderboardOperationAction,
  useLeaderboardOperations,
  useLeaderboardOperationDetail,
  type LeaderboardOperation,
} from "@/api/leaderboardOperations";
import {
  fetchLeaderboardQueues,
  leaderboardQueueKey,
  totalPendingKeys,
} from "@/api/leaderboardQueues";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";

function OperationHelp({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  return <HintTooltip>
    <TooltipTrigger asChild>
      <span tabIndex={0} aria-label={`${title}: ${description}`} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {children}
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" sideOffset={8} className="max-w-sm space-y-1 p-3 text-left leading-relaxed">
      <p className="font-semibold">{title}</p>
      <p className="text-zinc-300">{description}</p>
    </TooltipContent>
  </HintTooltip>;
}

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
  const [afterDate, setAfterDate] = useState("");
  const [beforeDate, setBeforeDate] = useState(utcTomorrow);
  const [runID, setRunID] = useState("");
  const invalidDateRange = !!afterDate && !!beforeDate && afterDate >= beforeDate;
  const operations = useLeaderboardOperations(tenantID);
  const action = useLeaderboardOperationAction(tenantID);
  const rows = sortedOperations(operations.data?.operations ?? []);
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
      <AdminLeaderboardQueues tenantID={tenantID} tenantName={tenantName} />
      <AdminLeaderboardHighlights tenantID={tenantID} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block">Runs completed from</span>
          <input
            aria-label={`${tenantName} completion start date`}
            type="date"
            value={afterDate}
            onChange={(event) => setAfterDate(event.target.value)}
            className="h-9 rounded-md border bg-background px-3"
          />
          <span className="block text-xs text-muted-foreground">
            Optional · 00:00 UTC (inclusive)
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block">Runs completed before</span>
          <input
            aria-label={`${tenantName} completion end date`}
            type="date"
            required
            value={beforeDate}
            onChange={(event) => setBeforeDate(event.target.value)}
            className="h-9 rounded-md border bg-background px-3"
          />
          <span className="block text-xs text-muted-foreground">
            00:00 UTC (exclusive)
          </span>
        </label>
        <OperationHelp title="Populate historical coverage" description="Process runs completed in the selected UTC date range, including runs already represented, then reconcile existing all-time evidence and results. Uses the same pipeline as Repair tenant; records a backfill and shows an incomplete-coverage notice.">
        <Button
          disabled={
            !beforeDate ||
            invalidDateRange ||
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
              after_date: afterDate || undefined,
              before_date: beforeDate,
            })
          }
        >
          Backfill {tenantName}
        </Button>
        </OperationHelp>
        <OperationHelp title="Recalculate tenant data" description="Use the same date-scoped scan and all-time reconciliation as Backfill to refresh stale or incorrect leaderboard data. Records a repair and shows a recalculation notice; it is not a different processing algorithm.">
        <Button
          variant="outline"
          disabled={
            !beforeDate ||
            invalidDateRange ||
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
              after_date: afterDate || undefined,
              before_date: beforeDate,
            })
          }
        >
          Repair tenant
        </Button>
        </OperationHelp>
      </div>
      {invalidDateRange && (
        <p role="alert" className="text-xs text-destructive">
          The start date must be before the exclusive end date.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Uses run completion time, not upload time. The end date defaults to
        tomorrow so runs completed today are included, and it may be set further
        into the future. The operation scans current data; it does not wait for
        future runs. Runs without a completion date are not covered by a date
        scan. The range is not an ingestion snapshot.
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
        <OperationHelp title="Repair one canonical run" description="Rebuild evidence for the entered run ID and recalculate affected results. Ignores the date cutoff and supports runs without completion dates. Completion still waits for all pending tenant processing.">
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
        </OperationHelp>
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
                    "Run discovery range",
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
                        : `${operation.after_date ? `${operation.after_date} 00:00 UTC (inclusive) → ` : "All history → "}${operation.before_date} 00:00 UTC (exclusive)`}
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
interface TenantAttention {
  tenant: Tenant;
  /** undefined while loading or when counts are unavailable; never conflated with zero. */
  pending: number | undefined;
  activeOperation: LeaderboardOperation | undefined;
  lastError: string | undefined;
  lastCompletedAt: string | undefined;
  /** False until both the dirty-queue and operation-history fetches for this tenant resolve. */
  settled: boolean;
}

/** Unsettled tenants default to needing attention rather than flashing idle first. */
function needsAttention(status: TenantAttention): boolean {
  return (
    !status.settled ||
    !!status.pending ||
    !!status.activeOperation ||
    !!status.lastError
  );
}

function attentionScore(status: TenantAttention): number {
  if (!status.settled) return Number.POSITIVE_INFINITY;
  return (
    (status.lastError ? 2_000_000_000 : 0) +
    (status.activeOperation ? 1_000_000_000 : 0) +
    (status.pending ?? 0)
  );
}

function tileStatusDotClass(status: TenantAttention): string {
  if (status.lastError) return "bg-red-500";
  if (status.activeOperation || status.pending) return "bg-amber-500";
  return "bg-emerald-500";
}

function tileSubtitle(status: TenantAttention): string {
  if (status.lastError) return "error · needs attention";
  if (status.activeOperation) {
    return `${status.activeOperation.state} · ${status.activeOperation.phase.replaceAll("_", " ")}`;
  }
  if (status.pending) return `${status.pending.toLocaleString()} pending keys`;
  return "0 pending keys";
}

function TenantTile({
  status,
  onOpen,
}: {
  status: TenantAttention;
  onOpen: () => void;
}) {
  const { tenant } = status;
  const attention = needsAttention(status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left text-xs transition-colors hover:border-foreground/30",
        attention
          ? "border-amber-900/50 bg-amber-500/5 hover:bg-amber-500/10"
          : "bg-muted/10 hover:bg-muted/40",
      )}
    >
      <span className="flex w-full items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tileStatusDotClass(status),
          )}
        />
        <span className="truncate font-medium text-foreground">
          {tenant.name}
        </span>
      </span>
      <span className="truncate text-muted-foreground">
        {tileSubtitle(status)}
      </span>
      {!attention && status.lastCompletedAt && (
        <span className="truncate text-muted-foreground">
          synced {dateTime(status.lastCompletedAt)}
        </span>
      )}
      {status.lastError && (
        <span className="line-clamp-1 text-destructive">
          {status.lastError}
        </span>
      )}
    </button>
  );
}

export function AdminLeaderboardOperations() {
  const tenants = useAdminTenants();
  const tenantList = tenants.data ?? [];
  const [openTenant, setOpenTenant] = useState<Tenant | null>(null);
  const queueQueries = useQueries({
    queries: tenantList.map((tenant) => ({
      queryKey: leaderboardQueueKey(tenant.id),
      queryFn: () => fetchLeaderboardQueues(tenant.id),
      enabled: !!tenant.id,
      refetchInterval: 15_000,
      retry: false,
    })),
  });
  const operationQueries = useQueries({
    queries: tenantList.map(
      (tenant): UseQueryOptions<LeaderboardOperationList> => ({
        queryKey: operationKey(tenant.id),
        queryFn: () => fetchLeaderboardOperations(tenant.id),
        retry: false,
        refetchInterval: (query) =>
          query.state.data?.operations.some(operationActive) ? 15_000 : false,
      }),
    ),
  });

  const statuses: TenantAttention[] = tenantList.map((tenant, index) => {
    const queueQuery = queueQueries[index];
    const operationQuery = operationQueries[index];
    const rows = sortedOperations(operationQuery.data?.operations ?? []);
    return {
      tenant,
      pending: totalPendingKeys(queueQuery.data),
      activeOperation: rows.find(operationActive),
      lastError: rows[0]?.last_error || undefined,
      lastCompletedAt: rows[0]?.completed_at,
      settled: !queueQuery.isPending && !operationQuery.isPending,
    };
  });
  const sorted = [...statuses].sort(
    (a, b) =>
      attentionScore(b) - attentionScore(a) ||
      a.tenant.name.localeCompare(b.tenant.name),
  );
  const attentionCount = statuses.filter(needsAttention).length;
  const idleCount = statuses.length - attentionCount;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Leaderboard operations</h2>
        <p className="text-sm text-muted-foreground">
          Backfill historical runs or repair existing results. Discovery and
          queued processing are separate phases. Every tenant is a tile,
          worst first — click one to manage it.
        </p>
        {!!statuses.length && (
          <p className="mt-2 text-xs">
            <span
              className={
                attentionCount ? "text-amber-400" : "text-emerald-400"
              }
            >
              {attentionCount} need attention
            </span>
            <span className="text-muted-foreground"> · {idleCount} idle</span>
          </p>
        )}
      </div>
      {tenants.isPending ? (
        <p role="status">Loading tenants…</p>
      ) : tenants.isError ? (
        <p role="alert" className="text-destructive">
          {tenants.error.message}
        </p>
      ) : tenantList.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenants found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sorted.map((status) => (
            <TenantTile
              key={status.tenant.id}
              status={status}
              onOpen={() => setOpenTenant(status.tenant)}
            />
          ))}
        </div>
      )}
      <Sheet
        open={!!openTenant}
        onOpenChange={(open) => {
          if (!open) setOpenTenant(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl lg:max-w-4xl"
        >
          <SheetHeader className="border-b">
            <SheetTitle>{openTenant?.name}</SheetTitle>
            <SheetDescription>
              Leaderboard operations for this tenant.
            </SheetDescription>
          </SheetHeader>
          {openTenant && (
            <div className="p-4">
              <TenantLeaderboardOperations
                tenantID={openTenant.id}
                tenantName={openTenant.name}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
