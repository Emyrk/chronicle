import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import {
  AdminInfrastructureCosts,
  type CostReportUser,
  type InfrastructureCostReport,
} from "./AdminInfrastructureCosts";

const reportsQueryKey = ["admin", "infrastructure-costs"] as const;

type ReportListItem = {
  id: string;
  periodStart: string;
  periodEnd: string;
  revision: number;
  generatedAt: string;
  totalCostMicrodollars: number;
};

type ReportListResponse = {
  reports: ReportListItem[];
  limit: number;
  offset: number;
};

type APIService = {
  serviceId: string;
  serviceName: string;
  totalCostMicrodollars: number;
  cpuCostMicrodollars: number;
  memoryCostMicrodollars: number;
  networkCostMicrodollars: number;
  diskCostMicrodollars: number;
  backupCostMicrodollars: number;
};

type APIUser = {
  userId: string;
  usernameSnapshot?: string;
  activeUploader: boolean;
  uploadCount: number;
  monthlyParsedEventBytes: number;
  currentParsedStorageBytes: number;
  sharedCostMicrodollars: number;
  activityCostMicrodollars: number;
  storageCostMicrodollars: number;
  totalCostMicrodollars: number;
};

type UsersResponse = {
  users: APIUser[];
  limit: number;
  offset: number;
  total: number;
};

type APIReport = {
  id: string;
  status?: "published" | "building" | "failed";
  generatedAt: string;
  storageAsOf?: string;
  periodStart: string;
  periodEnd: string;
  provider: string;
  projectName?: string;
  serverType?: string;
  coverage?: "complete" | "partial";
  previousTotalCostMicrodollars?: number;
  totalCostMicrodollars: number;
  memoryCostMicrodollars: number;
  cpuCostMicrodollars: number;
  networkCostMicrodollars: number;
  diskCostMicrodollars: number;
  backupCostMicrodollars: number;
  sharedCostMicrodollars: number;
  activityCostMicrodollars: number;
  storageCostMicrodollars: number;
  inactiveStorageCostMicrodollars?: number;
  services: APIService[];
  usage: {
    registeredUsersAtEnd: number;
    newUsers: number;
    activeUploaderCount: number;
    uploadCount: number;
    uploadedLogGroupCount?: number;
    uploadedRawBytes: number;
    uploadedStoredBytes: number;
    parsedInstanceCount: number;
    monthlyParsedEventBytes: number;
    currentParsedStorageBytes: number;
    storageOwnerCount: number;
    inactiveStorageOwnerCount: number;
  };
  unitEconomics: {
    costPerActiveUploaderMicrodollars: number;
    costPerUploadedLogMicrodollars: number;
    costPerParsedInstanceMicrodollars: number;
    medianCostMicrodollars: number;
    p75CostMicrodollars: number;
    p95CostMicrodollars: number;
    p99CostMicrodollars: number;
    maximumCostMicrodollars: number;
    topOnePercentBasisPoints: number;
    topFivePercentBasisPoints: number;
    topTenPercentBasisPoints: number;
  };
  warnings: Array<string | { code: string; message: string }>;
};

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
    uploadedFiles: user.uploadCount,
    monthlyParsedBytes: user.monthlyParsedEventBytes,
    currentParsedBytes: user.currentParsedStorageBytes,
    sharedCostMicros: user.sharedCostMicrodollars,
    activityCostMicros: user.activityCostMicrodollars,
    storageCostMicros: user.storageCostMicrodollars,
    totalCostMicros: user.totalCostMicrodollars,
  };
}

function normalizeReport(report: APIReport, users: APIUser[]): InfrastructureCostReport {
  return {
    id: report.id,
    status: report.status ?? "published",
    generatedAt: report.generatedAt,
    storageAsOf: report.storageAsOf ?? report.generatedAt,
    period: { start: report.periodStart, end: report.periodEnd },
    scope: {
      provider: report.provider,
      projectName: report.projectName ?? "Chronicle",
      serverType: report.serverType ?? "configured deployment",
      coverage: report.coverage ?? "partial",
    },
    costs: {
      totalCostMicros: report.totalCostMicrodollars,
      previousTotalCostMicros: report.previousTotalCostMicrodollars,
      memoryCostMicros: report.memoryCostMicrodollars,
      cpuCostMicros: report.cpuCostMicrodollars,
      egressCostMicros: report.networkCostMicrodollars,
      volumeCostMicros: report.diskCostMicrodollars,
      backupCostMicros: report.backupCostMicrodollars,
      sharedCostMicros: report.sharedCostMicrodollars,
      activityCostMicros: report.activityCostMicrodollars,
      storageCostMicros: report.storageCostMicrodollars,
      inactiveStorageCostMicros: report.inactiveStorageCostMicrodollars ?? 0,
      services: report.services.map((service) => ({
        id: service.serviceId,
        name: service.serviceName,
        totalCostMicros: service.totalCostMicrodollars,
        cpuCostMicros: service.cpuCostMicrodollars,
        memoryCostMicros: service.memoryCostMicrodollars,
        egressCostMicros: service.networkCostMicrodollars,
        volumeCostMicros: service.diskCostMicrodollars,
        backupCostMicros: service.backupCostMicrodollars,
      })),
    },
    usage: {
      registeredUsers: report.usage.registeredUsersAtEnd,
      newUsers: report.usage.newUsers,
      activeUploaders: report.usage.activeUploaderCount,
      uploadedFiles: report.usage.uploadCount,
      parsedInstances: report.usage.parsedInstanceCount,
      uploadedRawBytes: report.usage.uploadedRawBytes,
      uploadedStoredBytes: report.usage.uploadedStoredBytes,
      monthlyParsedBytes: report.usage.monthlyParsedEventBytes,
      currentParsedBytes: report.usage.currentParsedStorageBytes,
      inactiveStorageOwners: report.usage.inactiveStorageOwnerCount,
    },
    unitEconomics: {
      costPerActiveUploaderMicros: report.unitEconomics.costPerActiveUploaderMicrodollars,
      costPerUploadedLogMicros: report.unitEconomics.costPerUploadedLogMicrodollars,
      costPerParsedInstanceMicros: report.unitEconomics.costPerParsedInstanceMicrodollars,
      medianCostMicros: report.unitEconomics.medianCostMicrodollars,
      p75CostMicros: report.unitEconomics.p75CostMicrodollars,
      p95CostMicros: report.unitEconomics.p95CostMicrodollars,
      p99CostMicros: report.unitEconomics.p99CostMicrodollars,
      maximumCostMicros: report.unitEconomics.maximumCostMicrodollars,
      topOnePercentBasisPoints: report.unitEconomics.topOnePercentBasisPoints,
      topFivePercentBasisPoints: report.unitEconomics.topFivePercentBasisPoints,
      topTenPercentBasisPoints: report.unitEconomics.topTenPercentBasisPoints,
    },
    users: users.map(normalizeUser),
    warnings: report.warnings.map((warning) => typeof warning === "string"
      ? { code: "REPORT_WARNING", message: warning }
      : warning),
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
