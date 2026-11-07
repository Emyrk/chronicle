import { Loader2, RefreshCw } from "lucide-react";
import {
  queueFamilyLabel,
  queueWorkAge,
  useLeaderboardQueues,
} from "@/api/leaderboardQueues";
import { Button } from "@/components/ui/button";

export function AdminLeaderboardQueues({
  tenantID,
  tenantName,
}: {
  tenantID: string;
  tenantName: string;
}) {
  const query = useLeaderboardQueues(tenantID);
  const snapshot = query.data;
  const pending = snapshot?.queues.length
    ? snapshot.queues.reduce((sum, row) => sum + row.pending, 0)
    : undefined;
  const collected = snapshot ? new Date(snapshot.collected_at) : undefined;
  const collectedLabel =
    collected && Number.isFinite(collected.getTime())
      ? collected.toISOString().replace("T", " ").replace(".000Z", " UTC")
      : "Unavailable";
  return (
    <section
      aria-label={`${tenantName} leaderboard dirty queues`}
      className="space-y-3 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">
            Dirty queues
            {pending !== undefined && (
              <span className="ml-2 font-normal text-muted-foreground">
                {pending.toLocaleString()} pending keys
              </span>
            )}
          </h4>
          <p className="text-xs text-muted-foreground">
            Database-backed current work, independent of historical operations.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Refresh ${tenantName} dirty queues`}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? (
            <Loader2
              aria-hidden="true"
              className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <RefreshCw aria-hidden="true" className="mr-1.5 size-3.5" />
          )}
          Refresh
        </Button>
      </div>
      {query.isError && (
        <p role="alert" className="text-xs text-destructive">
          Could not refresh dirty queues. {query.error.message}{" "}
          {snapshot
            ? "Showing the last successful snapshot; counts may be stale."
            : "Current counts are unavailable, not zero."}
        </p>
      )}
      {!snapshot && query.isPending && (
        <p role="status" className="py-3 text-sm text-muted-foreground">
          Loading dirty queues…
        </p>
      )}
      {snapshot && (
        <>
          <p className="text-xs text-muted-foreground">
            {query.isError ? "Last successful snapshot" : "Collected"}:{" "}
            <time dateTime={snapshot.collected_at}>{collectedLabel}</time>. Ages
            are measured at collection time.
          </p>
          <div className="styled-scrollbar overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                {tenantName} dirty queue counts and oldest work ages
              </caption>
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Queue family
                  </th>
                  {["Pending", "Due", "Claimed", "Retrying"].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-2 py-2 text-right font-medium"
                    >
                      {label}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="whitespace-nowrap px-2 py-2 text-right font-medium"
                  >
                    Oldest pending
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap pl-2 py-2 text-right font-medium"
                  >
                    Oldest due
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.queues.map((row) => (
                  <tr key={row.family} className="border-b last:border-0">
                    <th
                      scope="row"
                      className="whitespace-nowrap py-2 pr-4 font-normal"
                    >
                      {queueFamilyLabel(row.family)}
                    </th>
                    {[row.pending, row.due, row.claimed, row.retrying].map(
                      (count, i) => (
                        <td
                          key={i}
                          className="px-2 py-2 text-right font-mono tabular-nums"
                        >
                          {count.toLocaleString()}
                        </td>
                      ),
                    )}
                    <td
                      className="whitespace-nowrap px-2 py-2 text-right font-mono"
                      title={row.oldest_pending_at}
                    >
                      {queueWorkAge(
                        row.oldest_pending_at,
                        snapshot.collected_at,
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap pl-2 py-2 text-right font-mono"
                      title={row.oldest_due_at}
                    >
                      {queueWorkAge(row.oldest_due_at, snapshot.collected_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snapshot.queues.length === 0 && (
            <p role="status" className="text-xs text-muted-foreground">
              No queue families were returned; counts are unavailable.
            </p>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Pending is the total work in each family. Due, claimed and retrying
        overlap with pending and must not be added together. These are current
        counts, not lifetime processing totals.
      </p>
    </section>
  );
}
