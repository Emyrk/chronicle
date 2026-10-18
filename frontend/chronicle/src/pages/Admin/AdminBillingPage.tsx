import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Loader2,
  RefreshCw,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AdminBillingActivityResponse,
  AdminBillingReconciliationRun,
} from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

const activityQueryKey = ["admin", "billing", "activity"] as const;

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function runStatus(run: AdminBillingReconciliationRun) {
  if (run.status === "completed") {
    return {
      label: "Completed",
      className: "text-emerald-400",
      icon: CheckCircle2,
    };
  }
  if (run.status === "failed") {
    return { label: "Failed", className: "text-red-400", icon: XCircle };
  }
  return { label: run.status, className: "text-amber-400", icon: Clock3 };
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

export function AdminBillingPage() {
  const queryClient = useQueryClient();
  const activity = useQuery<AdminBillingActivityResponse>({
    queryKey: activityQueryKey,
    queryFn: async () => {
      const response = await fetch("/api/v1/admin/billing/activity");
      if (!response.ok) throw new Error("Failed to load billing activity");
      return response.json() as Promise<AdminBillingActivityResponse>;
    },
    refetchInterval: 5_000,
  });

  const resync = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/admin/billing/resync", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Failed to enqueue billing resync");
      return body;
    },
    onSuccess: (response) => {
      toast.success(response.message ?? "Billing resync queued.");
      void queryClient.invalidateQueries({ queryKey: activityQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to enqueue billing resync");
    },
  });

  if (activity.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = activity.data;
  const latestRun = data?.reconciliation_runs[0];
  const latestStatus = latestRun ? runStatus(latestRun) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold">Billing Operations</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Monitor Stripe webhook processing and authoritative subscription reconciliation.
          </p>
        </div>
        <Button onClick={() => resync.mutate()} disabled={resync.isPending} className="gap-2">
          {resync.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Force Resync
        </Button>
      </div>

      {activity.isError ? (
        <Card className="border-red-500/30 p-4 text-sm text-red-400">
          Billing activity could not be loaded. The page will retry automatically.
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border bg-muted/30 p-2">
              <DatabaseZap className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">Latest reconciliation</h2>
              <p className="text-xs text-muted-foreground">
                Runs automatically every 15 minutes. This page refreshes every 5 seconds.
              </p>
            </div>
          </div>
          {latestRun && latestStatus ? (
            <div className={`flex items-center gap-1.5 text-sm font-medium ${latestStatus.className}`}>
              <latestStatus.icon className="h-4 w-4" />
              {latestStatus.label} · {formatDate(latestRun.completed_at ?? latestRun.started_at)}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No reconciliation recorded</span>
          )}
        </div>

        {latestRun ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Stripe subscriptions" value={latestRun.subscriptions_seen} />
            <Metric label="Subscriptions changed" value={latestRun.subscriptions_changed} />
            <Metric label="Entitlement customers" value={latestRun.entitlement_customers_found} />
            <Metric label="Entitlements synced" value={latestRun.entitlement_customers_synced} />
          </div>
        ) : null}

        {latestRun?.error_text ? (
          <p className="mt-4 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {latestRun.error_text}
          </p>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Reconciliation history</h2>
            <p className="text-xs text-muted-foreground">Most recent authoritative Stripe scans.</p>
          </div>
        </div>
        <div className="styled-scrollbar overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Started</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Local customers</th>
                <th className="px-3 py-3 text-right font-medium">Stripe subscriptions</th>
                <th className="px-3 py-3 text-right font-medium">Changed</th>
                <th className="px-3 py-3 text-right font-medium">Invalid</th>
                <th className="px-5 py-3 text-right font-medium">Entitlements synced</th>
              </tr>
            </thead>
            <tbody>
              {(data?.reconciliation_runs ?? []).slice(0, 20).map((run) => {
                const status = runStatus(run);
                return (
                  <tr key={run.id} className="border-t hover:bg-muted/20">
                    <td className="whitespace-nowrap px-5 py-3">{formatDate(run.started_at)}</td>
                    <td className={`px-3 py-3 font-medium ${status.className}`}>{status.label}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{run.provider_customers_found}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{run.subscriptions_seen}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{run.subscriptions_changed}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{run.subscriptions_skipped_invalid}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {run.entitlement_customers_synced}/{run.entitlement_customers_found}
                    </td>
                  </tr>
                );
              })}
              {!data?.reconciliation_runs.length ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                    No reconciliation runs recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Recent webhooks</h2>
              <p className="text-xs text-muted-foreground">Latest Stripe deliveries received by Chronicle.</p>
            </div>
          </div>
          <div className="styled-scrollbar max-h-96 overflow-auto">
            <table className="w-full min-w-[580px] text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-3 py-3 font-medium">Received</th>
                  <th className="px-5 py-3 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {(data?.webhook_deliveries ?? []).slice(0, 25).map((delivery) => (
                  <tr key={delivery.stripe_event_id} className="border-t hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <p className="font-medium">{delivery.event_type}</p>
                      <code className="text-xs text-muted-foreground">{delivery.stripe_event_id}</code>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(delivery.received_at)}</td>
                    <td className="px-5 py-3">
                      <span className={delivery.processed_at ? "text-emerald-400" : "text-amber-400"}>
                        {delivery.processed_at ? "Processed" : "Pending / failed"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!data?.webhook_deliveries.length ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
                      No webhook deliveries recorded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <DatabaseZap className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Local subscriptions</h2>
              <p className="text-xs text-muted-foreground">Current subscription snapshots stored by Chronicle.</p>
            </div>
          </div>
          <div className="styled-scrollbar max-h-96 overflow-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Subscription</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Period end</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(data?.subscriptions ?? []).map((subscription) => (
                  <tr key={`${subscription.provider}:${subscription.provider_customer_id}`} className="border-t hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <p className="font-medium">{subscription.product_code}</p>
                      <code className="text-xs text-muted-foreground">
                        {subscription.provider_subscription_id || subscription.provider_customer_id}
                      </code>
                    </td>
                    <td className="px-3 py-3 capitalize">{subscription.status}</td>
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(subscription.current_period_end)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{formatDate(subscription.updated_at)}</td>
                  </tr>
                ))}
                {!data?.subscriptions.length ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      No local subscriptions recorded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
