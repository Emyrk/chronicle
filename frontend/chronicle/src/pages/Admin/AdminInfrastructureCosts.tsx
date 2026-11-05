import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Cloud,
  Cpu,
  Database,
  Download,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";

export type CostService = {
  id: string;
  name: string;
  totalCostMicros: number;
  cpuCostMicros: number;
  memoryCostMicros: number;
  egressCostMicros: number;
  volumeCostMicros: number;
  backupCostMicros: number;
};

export type CostReportUser = {
  id: string;
  username: string;
  activeUploader: boolean;
  uploadedFiles: number;
  monthlyParsedBytes: number;
  currentParsedBytes: number;
  sharedCostMicros: number;
  activityCostMicros: number;
  storageCostMicros: number;
  totalCostMicros: number;
};

export type InfrastructureCostReport = {
  id: string;
  status: "published" | "building" | "failed";
  generatedAt: string;
  storageAsOf: string;
  period: { start: string; end: string };
  scope: {
    provider: string;
    projectName: string;
    serverType: string;
    coverage: "complete" | "partial";
  };
  costs: {
    totalCostMicros: number;
    previousTotalCostMicros?: number;
    memoryCostMicros: number;
    cpuCostMicros: number;
    egressCostMicros: number;
    volumeCostMicros: number;
    backupCostMicros: number;
    sharedCostMicros: number;
    activityCostMicros: number;
    storageCostMicros: number;
    inactiveStorageCostMicros: number;
    services: CostService[];
  };
  usage: {
    registeredUsers: number;
    newUsers: number;
    activeUploaders: number;
    uploadedFiles: number;
    parsedInstances: number;
    uploadedRawBytes: number;
    uploadedStoredBytes: number;
    monthlyParsedBytes: number;
    currentParsedBytes: number;
    inactiveStorageOwners: number;
  };
  unitEconomics: {
    costPerActiveUploaderMicros: number;
    costPerUploadedLogMicros: number;
    costPerParsedInstanceMicros: number;
    medianCostMicros: number;
    p75CostMicros: number;
    p95CostMicros: number;
    p99CostMicros: number;
    maximumCostMicros: number;
    topOnePercentBasisPoints: number;
    topFivePercentBasisPoints: number;
    topTenPercentBasisPoints: number;
  };
  users: CostReportUser[];
  warnings: Array<{ code: string; message: string }>;
};

type View = "overview" | "users" | "methodology";

const COST_COLORS = {
  memory: "bg-amber-400",
  cpu: "bg-cyan-400",
  egress: "bg-fuchsia-400",
  storage: "bg-emerald-400",
};

function money(micros: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(micros / 1_000_000);
}

function bytes(value: number): string {
  if (!value) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** exponent).toFixed(exponent > 2 ? 1 : 0)} ${units[exponent]}`;
}

function percentage(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%";
}

function periodLabel(period: InfrastructureCostReport["period"]): string {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(new Date(period.start))} – ${formatter.format(new Date(period.end))}`;
}

function delta(current: number, previous?: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function Kpi({ label, value, detail, icon: Icon, accent }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Gauge;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/8 bg-black/15 p-4">
      <div className={`absolute inset-x-0 top-0 h-px ${accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-muted-foreground transition-colors group-hover:text-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function CostComposition({ report }: { report: InfrastructureCostReport }) {
  const { costs } = report;
  const categories = [
    { label: "Memory", value: costs.memoryCostMicros, color: COST_COLORS.memory, icon: MemoryStick },
    { label: "Database storage", value: costs.volumeCostMicros + costs.backupCostMicros, color: COST_COLORS.storage, icon: HardDrive },
    { label: "Egress", value: costs.egressCostMicros, color: COST_COLORS.egress, icon: Network },
    { label: "CPU", value: costs.cpuCostMicros, color: COST_COLORS.cpu, icon: Cpu },
  ];
  return (
    <Card className="gap-5 border-white/8 bg-card/70 p-5">
      <SectionHeading eyebrow="Spend mix" title="Where the Railway bill went" detail="Memory dominates the cost base; compute is a comparatively small driver." />
      <div className="flex h-3 overflow-hidden rounded-full bg-white/5" aria-label="Cost composition">
        {categories.map((category) => (
          <div key={category.label} className={category.color} style={{ width: percentage(category.value, costs.totalCostMicros) }} title={`${category.label}: ${money(category.value)}`} />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {categories.map((category) => (
          <div key={category.label} className="flex items-center justify-between rounded-lg border border-white/6 bg-black/10 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${category.color}`} />
              <category.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">{category.label}</span>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm tabular-nums">{money(category.value)}</p>
              <p className="text-[10px] text-muted-foreground">{percentage(category.value, costs.totalCostMicros)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UserDistribution({ report }: { report: InfrastructureCostReport }) {
  const points = [
    { label: "Median", value: report.unitEconomics.medianCostMicros },
    { label: "P75", value: report.unitEconomics.p75CostMicros },
    { label: "P95", value: report.unitEconomics.p95CostMicros },
    { label: "P99", value: report.unitEconomics.p99CostMicros },
    { label: "Max", value: report.unitEconomics.maximumCostMicros },
  ];
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <Card className="gap-5 border-white/8 bg-card/70 p-5">
      <SectionHeading eyebrow="Distribution" title="Cost per active uploader" detail="The long tail remains shallow because shared platform cost is the largest component." />
      <div className="space-y-3">
        {points.map((point, index) => (
          <div key={point.label} className="grid grid-cols-[3.25rem_1fr_4.5rem] items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">{point.label}</span>
            <div className="relative h-2 overflow-hidden rounded-full bg-white/5">
              <div className={`h-full rounded-full ${index < 2 ? "bg-emerald-400" : index < 4 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${Math.max((point.value / max) * 100, 2)}%` }} />
            </div>
            <span className="text-right font-mono text-xs tabular-nums">{money(point.value, 3)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/8 rounded-lg border border-white/8 bg-black/10 py-3 text-center">
        {[
          ["Top 1%", report.unitEconomics.topOnePercentBasisPoints],
          ["Top 5%", report.unitEconomics.topFivePercentBasisPoints],
          ["Top 10%", report.unitEconomics.topTenPercentBasisPoints],
        ].map(([label, basisPoints]) => (
          <div key={label}>
            <p className="font-mono text-sm tabular-nums">{(Number(basisPoints) / 100).toFixed(1)}%</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{label} of user cost</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Overview({ report }: { report: InfrastructureCostReport }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <CostComposition report={report} />
        <UserDistribution report={report} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="gap-0 overflow-hidden border-white/8 bg-card/70 py-0">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <SectionHeading eyebrow="Services" title="Railway cost centers" detail="Provider totals preserved exactly as billed." />
            <Server className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="styled-scrollbar overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-black/15 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-3 py-3 text-right font-medium">Memory</th>
                  <th className="px-3 py-3 text-right font-medium">CPU</th>
                  <th className="px-3 py-3 text-right font-medium">Egress</th>
                  <th className="px-3 py-3 text-right font-medium">Storage</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.costs.services.map((service) => (
                  <tr key={service.id} className="border-t border-white/6 hover:bg-white/[0.025]">
                    <td className="px-5 py-3.5 font-medium">{service.name}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{money(service.memoryCostMicros)}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{money(service.cpuCostMicros)}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{money(service.egressCostMicros)}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{money(service.volumeCostMicros + service.backupCostMicros)}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold tabular-nums">{money(service.totalCostMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="gap-5 border-white/8 bg-card/70 p-5">
          <SectionHeading eyebrow="Volume" title="Usage during the period" detail="Uploads are grouped by their creation time within the Railway billing window." />
          <div className="space-y-4">
            {[
              ["Original uploads", bytes(report.usage.uploadedRawBytes), `${report.usage.uploadedFiles.toLocaleString()} files`],
              ["Compressed uploads", bytes(report.usage.uploadedStoredBytes), "stored object size"],
              ["Parsed events created", bytes(report.usage.monthlyParsedBytes), `${report.usage.parsedInstances.toLocaleString()} instances`],
              ["Current parsed footprint", bytes(report.usage.currentParsedBytes), `${report.usage.inactiveStorageOwners} inactive owners`],
            ].map(([label, value, detail]) => (
              <div key={label} className="flex items-end justify-between gap-4 border-b border-white/6 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{detail}</p>
                </div>
                <p className="font-mono text-sm tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function UsersView({ report, total, offset, limit, onPageChange }: {
  report: InfrastructureCostReport;
  total: number;
  offset: number;
  limit: number;
  onPageChange?: (offset: number) => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden border-white/8 bg-card/70 py-0">
      <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading eyebrow="Allocation ledger" title="Highest-cost users" detail="Shared cost plus proportional parse activity and current parsed storage." />
        <p className="text-xs text-muted-foreground">Showing {offset + 1}–{Math.min(offset + report.users.length, total)} of {total.toLocaleString()}</p>
      </div>
      <div className="styled-scrollbar overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-black/15 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-3 py-3 text-right font-medium">Logs</th>
              <th className="px-3 py-3 text-right font-medium">Period parse</th>
              <th className="px-3 py-3 text-right font-medium">Stored parse</th>
              <th className="px-3 py-3 text-right font-medium">Shared</th>
              <th className="px-3 py-3 text-right font-medium">Activity</th>
              <th className="px-3 py-3 text-right font-medium">Storage</th>
              <th className="px-5 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...report.users].sort((a, b) => b.totalCostMicros - a.totalCostMicros).map((user, index) => (
              <tr key={user.id} className="border-t border-white/6 hover:bg-white/[0.025]">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="w-5 font-mono text-[10px] text-muted-foreground">{String(offset + index + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-[10px] text-muted-foreground">{user.activeUploader ? "Active uploader" : "Storage only"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums">{user.uploadedFiles}</td>
                <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{bytes(user.monthlyParsedBytes)}</td>
                <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{bytes(user.currentParsedBytes)}</td>
                <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums">{money(user.sharedCostMicros, 3)}</td>
                <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums">{money(user.activityCostMicros, 3)}</td>
                <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums">{money(user.storageCostMicros, 3)}</td>
                <td className="px-5 py-3.5 text-right font-mono font-semibold tabular-nums text-amber-300">{money(user.totalCostMicros, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > limit ? (
        <div className="flex items-center justify-between border-t border-white/8 px-5 py-3">
          <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => onPageChange?.(Math.max(0, offset - limit))}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}</span>
          <Button variant="ghost" size="sm" disabled={offset + limit >= total} onClick={() => onPageChange?.(offset + limit)}>Next</Button>
        </div>
      ) : null}
    </Card>
  );
}

function Methodology({ report }: { report: InfrastructureCostReport }) {
  const pools = [
    { name: "Shared platform", value: report.costs.sharedCostMicros, driver: "Equal share across active uploaders", includes: "Memory, egress, unclassified", color: "border-amber-400/40 bg-amber-400/5" },
    { name: "Activity", value: report.costs.activityCostMicros, driver: "Period parsed bytes", includes: "CPU", color: "border-cyan-400/40 bg-cyan-400/5" },
    { name: "Storage", value: report.costs.storageCostMicros, driver: "Point-in-time parsed bytes", includes: "Volumes and backups", color: "border-emerald-400/40 bg-emerald-400/5" },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.75fr]">
      <Card className="gap-5 border-white/8 bg-card/70 p-5">
        <SectionHeading eyebrow="Calculation v1" title="Allocation policy" detail="Every microdollar is assigned deterministically, with remainder distribution for exact reconciliation." />
        <div className="space-y-3">
          {pools.map((pool, index) => (
            <div key={pool.name} className={`grid gap-3 rounded-xl border p-4 sm:grid-cols-[2.5rem_1fr_auto] sm:items-center ${pool.color}`}>
              <span className="font-mono text-lg text-muted-foreground">0{index + 1}</span>
              <div>
                <h3 className="font-semibold">{pool.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{pool.includes} · {pool.driver}</p>
              </div>
              <div className="sm:text-right">
                <p className="font-mono font-semibold tabular-nums">{money(pool.value)}</p>
                <p className="text-[10px] text-muted-foreground">{percentage(pool.value, report.costs.totalCostMicros)} of spend</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/8 bg-black/15 p-4 font-mono text-xs leading-6 text-muted-foreground">
          <p><span className="text-foreground">user_cost</span> = shared_pool / active_uploaders</p>
          <p className="pl-20">+ activity_pool × user_period_parse / total_period_parse</p>
          <p className="pl-20">+ storage_pool × user_stored_parse / total_stored_parse</p>
        </div>
      </Card>

      <Card className="gap-5 border-white/8 bg-card/70 p-5">
        <SectionHeading eyebrow="Data quality" title="Coverage and caveats" detail={`Generated ${new Date(report.generatedAt).toLocaleString()} from ${report.scope.serverType}.`} />
        <div className={`flex items-center gap-3 rounded-lg border px-3 py-3 ${report.scope.coverage === "complete" ? "border-emerald-400/30 bg-emerald-400/5" : "border-amber-400/30 bg-amber-400/5"}`}>
          {report.scope.coverage === "complete" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
          <div>
            <p className="text-sm font-medium capitalize">{report.scope.coverage} usage coverage</p>
            <p className="text-[11px] text-muted-foreground">Railway project spend compared with the configured Chronicle database.</p>
          </div>
        </div>
        <div className="space-y-3">
          {report.warnings.map((warning) => (
            <div key={warning.code} className="border-l border-amber-400/50 pl-3">
              <p className="font-mono text-[10px] text-amber-300">{warning.code}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{warning.message}</p>
            </div>
          ))}
        </div>
        <div className="mt-auto border-t border-white/8 pt-4 text-xs text-muted-foreground">
          Storage snapshot: <span className="font-mono text-foreground">{new Date(report.storageAsOf).toLocaleString()}</span>
        </div>
      </Card>
    </div>
  );
}

export function AdminInfrastructureCosts({
  report,
  reportOptions = [],
  generating = false,
  userTotal = report.users.length,
  userOffset = 0,
  userLimit = Math.max(report.users.length, 1),
  onSelectReport,
  onUserPageChange,
  onGenerate,
  onExport,
}: {
  report: InfrastructureCostReport;
  reportOptions?: Array<{ id: string; label: string }>;
  generating?: boolean;
  userTotal?: number;
  userOffset?: number;
  userLimit?: number;
  onSelectReport?: (id: string) => void;
  onUserPageChange?: (offset: number) => void;
  onGenerate?: () => void;
  onExport?: () => void;
}) {
  const [view, setView] = useState<View>("overview");
  const spendDelta = delta(report.costs.totalCostMicros, report.costs.previousTotalCostMicros);
  const views: Array<{ id: View; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "User ledger" },
    { id: "methodology", label: "Methodology" },
  ];

  return (
    <div className="relative overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="pointer-events-none absolute -left-40 -top-64 h-[34rem] w-[34rem] rounded-full bg-amber-400/5 blur-3xl" />
      <div className="relative mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-5 border-b border-white/8 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Cloud className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-mono uppercase tracking-[0.16em]">Railway · {report.scope.projectName}</span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">{report.status}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Infrastructure economics</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">What Chronicle cost to operate, who drove it, and how each dollar was allocated.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Button variant="outline" className="pointer-events-none gap-2 border-white/10 bg-black/10">
                <CalendarDays className="h-4 w-4" />
                {periodLabel(report.period)}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              {reportOptions.length > 1 ? (
                <select
                  aria-label="Select infrastructure report"
                  value={report.id}
                  onChange={(event) => onSelectReport?.(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {reportOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              ) : null}
            </div>
            <Button variant="outline" size="icon" onClick={onExport} aria-label="Export report"><Download className="h-4 w-4" /></Button>
            <Button onClick={onGenerate} disabled={!onGenerate || generating} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Generating…" : "Generate"}
            </Button>
          </div>
        </header>

        {report.scope.coverage === "partial" ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.045] px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p><span className="font-medium text-amber-200">Partial usage coverage.</span> <span className="text-muted-foreground">The Railway bill is project-wide while usage was collected from the {report.scope.serverType} database.</span></p>
          </div>
        ) : null}

        <section className="grid gap-3 lg:grid-cols-[1.45fr_repeat(3,minmax(0,0.75fr))]">
          <div className="relative overflow-hidden rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.11] via-card/80 to-card/60 p-5">
            <div className="absolute right-4 top-4 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-400/60">Primary KPI</div>
            <p className="text-xs font-medium text-muted-foreground">Blended cost per active uploader</p>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-5xl font-semibold tracking-[-0.06em] tabular-nums">{money(report.unitEconomics.costPerActiveUploaderMicros, 3)}</span>
              <span className="mb-1.5 text-xs text-muted-foreground">/ billing period</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-amber-400/15 pt-4 text-xs">
              <span className="text-muted-foreground">Median <strong className="ml-1 font-mono font-medium text-foreground">{money(report.unitEconomics.medianCostMicros, 3)}</strong></span>
              <span className="text-muted-foreground">P95 <strong className="ml-1 font-mono font-medium text-foreground">{money(report.unitEconomics.p95CostMicros, 3)}</strong></span>
              <span className="text-muted-foreground">Max <strong className="ml-1 font-mono font-medium text-foreground">{money(report.unitEconomics.maximumCostMicros, 3)}</strong></span>
            </div>
          </div>
          <Kpi label="Railway spend" value={money(report.costs.totalCostMicros)} detail={spendDelta === null ? "No previous report" : `${spendDelta >= 0 ? "+" : ""}${spendDelta.toFixed(1)}% vs previous period`} icon={CircleDollarSign} accent="bg-amber-400" />
          <Kpi label="Active uploaders" value={report.usage.activeUploaders.toLocaleString()} detail={`${report.usage.newUsers.toLocaleString()} new accounts`} icon={Users} accent="bg-cyan-400" />
          <Kpi label="Cost per log" value={money(report.unitEconomics.costPerUploadedLogMicros, 3)} detail={`${report.usage.uploadedFiles.toLocaleString()} uploaded logs`} icon={Gauge} accent="bg-emerald-400" />
        </section>

        <div className="flex items-center justify-between border-b border-white/8">
          <div className="flex gap-1">
            {views.map((item) => (
              <button key={item.id} type="button" onClick={() => setView(item.id)} className={`relative px-3 py-3 text-sm transition-colors ${view === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {item.label}
                {view === item.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-amber-400" /> : null}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex">
            {spendDelta !== null && spendDelta >= 0 ? <ArrowUpRight className="h-3 w-3 text-rose-400" /> : <ArrowDownRight className="h-3 w-3 text-emerald-400" />}
            Report #{report.id.slice(0, 8)} · generated {new Date(report.generatedAt).toLocaleDateString()}
          </div>
        </div>

        {view === "overview" ? <Overview report={report} /> : null}
        {view === "users" ? <UsersView report={report} total={userTotal} offset={userOffset} limit={userLimit} onPageChange={onUserPageChange} /> : null}
        {view === "methodology" ? <Methodology report={report} /> : null}

        <footer className="flex flex-col gap-2 border-t border-white/8 pt-4 text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Schema v1 · Calculation v1 · Currency USD</span>
          <span className="flex items-center gap-2"><Database className="h-3 w-3" /> Storage snapshot {new Date(report.storageAsOf).toLocaleString()}</span>
        </footer>
      </div>
    </div>
  );
}
