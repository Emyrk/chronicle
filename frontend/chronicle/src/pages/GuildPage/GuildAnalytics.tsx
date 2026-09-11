import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Eye,
  Lock,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useGuildPage, useGuildResourceAnalytics } from "@/api/queries";
import { cn } from "@/lib/utils";
import { GuildActionsMenu, GuildPageHeader } from "./components";
import { buildSummary, metricValue, METRIC_UNIT, type Metric } from "./guildAnalytics";

const numberFormatter = new Intl.NumberFormat();
const compactFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

const RANGE_OPTIONS = [7, 14, 30] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "unique", label: "Unique views" },
  { value: "total", label: "Total views" },
];

function formatDayLabel(date: string, rangeDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return rangeDays <= 14
    ? d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).slice(0, 2)
    : String(d.getUTCDate());
}

function formatDayTitle(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}


export function GuildAnalytics() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: pageConfig, isLoading: pageLoading } = useGuildPage(guildId);
  const { data: analytics, isLoading, error } = useGuildResourceAnalytics(guildId);
  const [range, setRange] = useState<RangeDays>(14);
  const [metric, setMetric] = useState<Metric>("unique");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const summary = useMemo(() => buildSummary(analytics?.days ?? [], range, metric), [analytics, range, metric]);

  if (pageLoading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }
  if (!pageConfig?.guild.can_edit) return <Navigate to={`/g/${guildId}`} replace />;

  return (
    <div className="relative w-full px-4 md:px-12">
      <GuildActionsMenu
        guildId={guildId!}
        canEdit={pageConfig.guild.can_edit}
        canViewRoster={pageConfig.guild.can_view_roster}
      />
      <GuildPageHeader guild={pageConfig.guild} theme={pageConfig.theme} />

      <div className="mx-auto max-w-6xl pb-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to={`/g/${guildId}`} className="text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">Popularity</h1>
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-500">
                  <Lock className="h-3 w-3" /> Officers only
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Guild page and raid-log traffic over time.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {METRIC_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMetric(m.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    m.value === metric
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="flex gap-1.5">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    r === range
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}D
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Failed to load guild analytics.</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={Eye} label="Guild page views" value={compactFormatter.format(summary.guildTotal)}>
                <DeltaLabel pct={summary.guildDeltaPct} range={range} />
              </MetricCard>
              <MetricCard icon={BarChart3} label="Instance views" value={compactFormatter.format(summary.instanceTotalAll)}>
                <span className="text-xs text-muted-foreground">across {summary.instances.length} deduplicated instances</span>
              </MetricCard>
              <MetricCard icon={Star} label="Most viewed instance" value={summary.instances[0]?.name ?? "—"} valueClassName="font-wow text-xl">
                <span className="text-xs text-amber-500">{summary.instances[0] ? `${compactFormatter.format(summary.instances[0].total)} ${METRIC_UNIT[metric]}` : "No views yet"}</span>
              </MetricCard>
              <MetricCard icon={CalendarDays} label="Busiest day" value={summary.busiestDay ? formatDayTitle(summary.busiestDay.date) : "—"}>
                <span className="text-xs text-muted-foreground">{summary.busiestDay ? `${numberFormatter.format(metricValue(summary.busiestDay, metric))} guild page ${METRIC_UNIT[metric]}` : "No views yet"}</span>
              </MetricCard>
            </div>

            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-5">
                <h2 className="font-semibold">Guild page traffic</h2>
                <p className="text-sm text-muted-foreground">Daily {METRIC_UNIT[metric]} over the last {range} days.</p>
              </div>
              {summary.guildSeries.every((d) => metricValue(d, metric) === 0) ? (
                <EmptyAnalytics />
              ) : (
                <div className="flex h-44 items-end gap-1 sm:gap-1.5" aria-label={`Daily guild page ${METRIC_UNIT[metric]}`}>
                  {summary.guildSeries.map((day, idx) => {
                    const value = metricValue(day, metric);
                    const isPeak = idx === summary.guildPeakIdx && value > 0;
                    return (
                      <div key={day.date} className="group relative flex flex-1 flex-col items-center justify-end gap-2">
                        {isPeak && (
                          <div className="absolute -top-5 whitespace-nowrap text-[10px] font-semibold text-amber-500">
                            {numberFormatter.format(value)}
                          </div>
                        )}
                        <div className="invisible absolute bottom-full mb-1 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-xs shadow group-hover:visible">
                          {formatDayTitle(day.date)} &middot; {numberFormatter.format(value)} {METRIC_UNIT[metric]}
                        </div>
                        <div
                          className={cn(
                            "w-full max-w-[26px] rounded-t transition-colors",
                            isPeak ? "bg-amber-500" : "bg-primary/60 group-hover:bg-primary",
                          )}
                          style={{ height: `${Math.max(4, (value / summary.guildMax) * 112)}px` }}
                        />
                        <span className="text-[10px] text-muted-foreground">{formatDayLabel(day.date, range)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-5">
                <h2 className="font-semibold">Top 10 instances &middot; {range}D</h2>
                <p className="text-sm text-muted-foreground">Instances without a stable slug are intentionally not tracked.</p>
              </div>
              {summary.instances.length === 0 ? (
                <div className="p-5"><EmptyAnalytics /></div>
              ) : (
                <div className="divide-y divide-border">
                  {summary.instances.slice(0, 10).map((instance, idx) => {
                    const isExpanded = !!expanded[instance.key];
                    return (
                      <div key={instance.key}>
                        <button
                          onClick={() => setExpanded((prev) => ({ ...prev, [instance.key]: !prev[instance.key] }))}
                          className="flex w-full items-center gap-2.5 px-5 py-1.5 text-left transition-colors hover:bg-muted/20"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <div className="w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">{idx + 1}</div>
                          <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: instance.color, boxShadow: `0 0 6px ${instance.color}55` }} />
                          <div className="w-48 shrink-0">
                            <div className="font-wow truncate text-sm font-semibold">{instance.name}</div>
                            {instance.members.length > 1 && (
                              <div className="text-[10px] text-muted-foreground">{instance.members.length} duplicate uploads</div>
                            )}
                          </div>
                          <div className="flex h-5 min-w-0 flex-1 items-end gap-[3px]">
                            {instance.series.map((day) => {
                              const value = metricValue(day, metric);
                              return (
                                <div
                                  key={day.date}
                                  title={`${formatDayTitle(day.date)} — ${numberFormatter.format(value)} ${METRIC_UNIT[metric]}`}
                                  className="min-w-0 max-w-[14px] flex-1 rounded-[1px]"
                                  style={{ height: `${Math.max(18, (value / instance.seriesMax) * 100)}%`, background: instance.color }}
                                />
                              );
                            })}
                          </div>
                          <div className="min-w-[110px] shrink-0 text-right">
                            <div className="font-mono text-sm">{compactFormatter.format(instance.total)}</div>
                            <DeltaLabel pct={instance.deltaPct} range={range} compact reference={compactFormatter.format(instance.prevTotal)} />
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-5 pb-4 pl-11">
                            <div
                              className="flex h-16 items-end gap-1.5"
                              style={{ width: `${(range / 30) * 100}%`, minWidth: "160px" }}
                            >
                              {instance.series.map((day) => {
                                const value = metricValue(day, metric);
                                return (
                                  <div key={day.date} className="group relative flex h-full min-w-0 max-w-6 flex-1 flex-col items-center justify-end gap-1">
                                    <div className="invisible absolute bottom-full mb-1 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-xs shadow group-hover:visible">
                                      {formatDayTitle(day.date)} &middot; {numberFormatter.format(value)} {METRIC_UNIT[metric]}
                                    </div>
                                    <div
                                      className="w-full rounded-t opacity-85 transition-opacity group-hover:opacity-100"
                                      style={{ height: `${Math.max(6, (value / instance.seriesMax) * 100)}%`, background: instance.color }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            {instance.members.length > 1 ? (
                              <div className="mt-3 overflow-hidden rounded-md border border-border/70">
                                <div className="bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Duplicate uploads
                                </div>
                                <div className="divide-y divide-border/70">
                                  {instance.members.map((member) => (
                                    <Link
                                      key={member.key}
                                      to={`/instances/${member.key}`}
                                      className="flex items-center gap-3 px-3 py-2 text-xs transition-colors hover:bg-muted/20"
                                    >
                                      <span className="min-w-0 flex-1">
                                        <span className="font-wow block truncate">{member.name}</span>
                                        <span className="block truncate font-mono text-[10px] text-muted-foreground">{member.key}</span>
                                      </span>
                                      <span className="shrink-0 text-right font-mono tabular-nums">
                                        <span className="block">{numberFormatter.format(member.total)} {METRIC_UNIT[metric]}</span>
                                        {metric === "total" && (
                                          <span className="block text-[10px] text-muted-foreground">
                                            {numberFormatter.format(member.uniqueVisitors)} daily unique views
                                          </span>
                                        )}
                                      </span>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <Link to={`/instances/${instance.members[0]?.key ?? instance.key}`} className="mt-2 inline-block text-xs text-amber-500 hover:text-amber-400">
                                Open instance page &rarr;
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <p className="text-xs text-muted-foreground">
              Numbers are approximate — view tracking is best-effort and can undercount or overcount depending on visitors' browsers and privacy settings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, valueClassName, children }: { icon: typeof Eye; label: string; value: string; valueClassName?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className={cn("truncate text-2xl font-semibold tabular-nums", valueClassName)} title={value}>{value}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function DeltaLabel({ pct, range, compact, reference }: { pct: number; range: number; compact?: boolean; reference?: string }) {
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className={cn("flex items-center gap-1 text-xs", pct >= 0 ? "text-emerald-500" : "text-muted-foreground", compact && "justify-end")}>
      <Icon className="h-3 w-3" />
      {pct >= 0 ? "+" : ""}{pct}% {compact ? (reference && `vs ${reference}`) : `vs prior ${range}d`}
    </div>
  );
}

function EmptyAnalytics() {
  return <div className="py-8 text-center text-sm text-muted-foreground">No views recorded yet.</div>;
}
