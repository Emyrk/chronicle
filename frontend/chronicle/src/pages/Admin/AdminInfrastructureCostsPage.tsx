import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  InfrastructureCostReport as APIReport,
  InfrastructureCostReportUser as APIUser,
  ListInfrastructureCostReportUsersResponse as UsersResponse,
  ListInfrastructureCostReportsResponse as ReportListResponse,
} from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import {
  AdminInfrastructureCosts,
  type CostReportUser,
  type InfrastructureCostReport,
} from "./AdminInfrastructureCosts";

const reportsQueryKey = ["admin", "infrastructure-costs"] as const;

async function readJSON<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `${fallback} (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function normalizeUser(user: APIUser): CostReportUser {
  return {
    id: user.userId,
    username: user.usernameSnapshot || user.userId,
    activeUploader: user.activeUploader,
    uploadedFiles: user.uploadedFiles,
    monthlyParsedBytes: user.monthlyParsedBytes,
    currentParsedBytes: user.currentParsedBytes,
    sharedCostMicros: user.sharedCostMicrodollars,
    activityCostMicros: user.activityCostMicrodollars,
    storageCostMicros: user.storageCostMicrodollars,
    totalCostMicros: user.totalCostMicrodollars,
  };
}

function normalizeReport(report: APIReport, users: readonly APIUser[]): InfrastructureCostReport {
  return {
    id: report.id,
    status: report.status === "building" ? "building" : report.status === "failed" ? "failed" : "published",
    generatedAt: report.generatedAt,
    storageAsOf: report.storageAsOf,
    period: { start: report.periodStart, end: report.periodEnd },
    scope: {
      provider: report.provider,
      projectName: report.scope.projectName,
      serverType: report.scope.serverType,
      coverage: report.scope.coverage === "complete" ? "complete" : "partial",
    },
    costs: {
      totalCostMicros: report.totalCostMicrodollars,
      previousTotalCostMicros: report.previousTotalCostMicrodollars,
      memoryCostMicros: report.costs.memoryMicrodollars,
      cpuCostMicros: report.costs.cpuMicrodollars,
      egressCostMicros: report.costs.egressMicrodollars,
      volumeCostMicros: report.costs.volumeMicrodollars,
      backupCostMicros: report.costs.backupMicrodollars,
      sharedCostMicros: report.pools.sharedMicrodollars,
      activityCostMicros: report.pools.activityMicrodollars,
      storageCostMicros: report.pools.storageMicrodollars,
      inactiveStorageCostMicros: report.pools.inactiveStorageMicrodollars,
      services: report.services.map((service) => ({
        id: service.serviceId,
        name: service.serviceName,
        totalCostMicros: service.totalCostMicrodollars,
        cpuCostMicros: service.costs.cpuMicrodollars,
        memoryCostMicros: service.costs.memoryMicrodollars,
        egressCostMicros: service.costs.egressMicrodollars,
        volumeCostMicros: service.costs.volumeMicrodollars,
        backupCostMicros: service.costs.backupMicrodollars,
      })),
    },
    usage: {
      registeredUsers: report.usage.registeredUsersAtEnd,
      newUsers: report.usage.newUsers,
      activeUploaders: report.usage.activeUploaders,
      uploadedFiles: report.usage.uploadedFiles,
      parsedInstances: report.usage.parsedInstances,
      uploadedRawBytes: report.usage.uploadedRawBytes,
      uploadedStoredBytes: report.usage.uploadedStoredBytes,
      monthlyParsedBytes: report.usage.monthlyParsedBytes,
      currentParsedBytes: report.usage.currentParsedBytes,
      inactiveStorageOwners: report.usage.inactiveStorageOwners,
    },
    unitEconomics: {
      costPerActiveUploaderMicros: report.usage.activeUploaders > 0
        ? Math.round(report.totalCostMicrodollars / report.usage.activeUploaders)
        : 0,
      costPerUploadedLogMicros: report.unitEconomics.costPerLogMicrodollars,
      costPerParsedInstanceMicros: report.unitEconomics.costPerParsedInstanceMicrodollars,
      medianCostMicros: report.unitEconomics.activeDistribution.median,
      p75CostMicros: report.unitEconomics.activeDistribution.p75,
      p95CostMicros: report.unitEconomics.activeDistribution.p95,
      p99CostMicros: report.unitEconomics.activeDistribution.p99,
      maximumCostMicros: report.unitEconomics.activeDistribution.max,
      topOnePercentBasisPoints: Math.round(report.unitEconomics.concentration.top1 * 10_000),
      topFivePercentBasisPoints: Math.round(report.unitEconomics.concentration.top5 * 10_000),
      topTenPercentBasisPoints: Math.round(report.unitEconomics.concentration.top10 * 10_000),
    },
    users: users.map(normalizeUser),
    warnings: report.warnings.map((warning) => ({ code: "REPORT_WARNING", message: warning })),
  };
}

function LoadingState() {
  return (
    <div className="flex min-h-72 items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Loading infrastructure economics…</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-2xl border-red-500/20 bg-red-500/5 p-6 text-center">
      <AlertTriangle className="mx-auto h-7 w-7 text-red-400" />
      <h1 className="mt-3 text-lg font-semibold">Infrastructure report unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-5" onClick={onRetry}>Try again</Button>
    </Card>
  );
}

function EmptyState({ generating, onGenerate }: { generating: boolean; onGenerate: () => void }) {
  return (
    <Card className="mx-auto max-w-2xl border-dashed p-8 text-center">
      <BarChart3 className="mx-auto h-9 w-9 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">No infrastructure reports yet</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Generate the previous closed Railway billing period to establish the first cost baseline.
      </p>
      <Button className="mt-5" disabled={generating} onClick={onGenerate}>
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Generate first report
      </Button>
    </Card>
  );
}

export function AdminInfrastructureCostsPage() {
  const queryClient = useQueryClient();
  const [selectedReportID, setSelectedReportID] = useState<string | null>(null);
  const [userOffset, setUserOffset] = useState(0);
  const userLimit = 100;
  const reports = useQuery({
    queryKey: reportsQueryKey,
    queryFn: async () => readJSON<ReportListResponse>(
      await fetch("/api/v1/admin/infrastructure-costs?limit=50&offset=0"),
      "Failed to load infrastructure reports",
    ),
    retry: false,
    refetchInterval: 10_000,
  });
  const selected = reports.data?.reports.find((report) => report.id === selectedReportID)
    ?? reports.data?.reports[0];
  const detail = useQuery({
    queryKey: [...reportsQueryKey, selected?.id],
    enabled: !!selected,
    queryFn: async () => readJSON<APIReport>(
      await fetch(`/api/v1/admin/infrastructure-costs/${selected!.id}`),
      "Failed to load infrastructure report",
    ),
    retry: false,
  });
  const users = useQuery({
    queryKey: [...reportsQueryKey, selected?.id, "users", userLimit, userOffset],
    enabled: !!selected,
    queryFn: async () => readJSON<UsersResponse>(
      await fetch(`/api/v1/admin/infrastructure-costs/${selected!.id}/users?limit=${userLimit}&offset=${userOffset}`),
      "Failed to load user allocations",
    ),
    retry: false,
  });
  const generate = useMutation({
    mutationFn: async () => readJSON<{ jobId: number }>(
      await fetch("/api/v1/admin/infrastructure-costs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      "Failed to queue infrastructure report",
    ),
    onSuccess: () => {
      toast.success("Infrastructure cost report queued.");
      void queryClient.invalidateQueries({ queryKey: reportsQueryKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to queue report"),
  });

  if (reports.isLoading || (selected && (detail.isLoading || users.isLoading))) return <LoadingState />;
  const error = reports.error ?? detail.error ?? users.error;
  if (error) {
    return <ErrorState message={error instanceof Error ? error.message : "Unknown error"} onRetry={() => {
      void reports.refetch();
      void detail.refetch();
      void users.refetch();
    }} />;
  }
  if (!selected || !detail.data || !users.data) {
    return <EmptyState generating={generate.isPending} onGenerate={() => generate.mutate()} />;
  }

  const report = normalizeReport({
    ...detail.data,
    previousTotalCostMicrodollars: detail.data.previousTotalCostMicrodollars
      ?? reports.data?.reports[1]?.totalCostMicrodollars,
  }, users.data.users);

  return <AdminInfrastructureCosts
    report={report}
    reportOptions={(reports.data?.reports ?? []).map((option) => ({
      id: option.id,
      label: `${new Date(option.periodStart).toLocaleDateString()} – ${new Date(option.periodEnd).toLocaleDateString()}`,
    }))}
    generating={generate.isPending}
    userTotal={users.data.total}
    userOffset={userOffset}
    userLimit={userLimit}
    onSelectReport={(id) => {
      setSelectedReportID(id);
      setUserOffset(0);
    }}
    onUserPageChange={setUserOffset}
    onGenerate={() => generate.mutate()}
    onExport={() => {
      const blob = new Blob([JSON.stringify(detail.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `chronicle-infrastructure-costs-${report.period.start.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }}
  />;
}
