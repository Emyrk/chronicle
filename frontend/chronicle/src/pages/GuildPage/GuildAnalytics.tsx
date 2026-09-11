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
import type { GuildResourceAnalyticsDay } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { getInstanceAccentColor } from "@/pages/Logs/utils/instanceImages";
import { GuildActionsMenu, GuildPageHeader } from "./components";

const numberFormatter = new Intl.NumberFormat();
const compactFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

const RANGE_OPTIONS = [7, 14, 30] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

type Metric = "unique" | "total";
const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "unique", label: "Unique views" },
  { value: "total", label: "Total views" },
];
const METRIC_UNIT: Record<Metric, string> = { unique: "unique views", total: "views" };

interface DayValue {
  date: string;
  views: number;
  uniqueVisitors: number;
}

function metricValue(day: DayValue, metric: Metric): number {
  return metric === "unique" ? day.uniqueVisitors : day.views;
}

/** Ascending date strings (UTC, YYYY-MM-DD), `count` days ending today. */
function buildDates(count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function seriesFor(byDate: Map<string, { views: number; uniqueVisitors: number }>, dates: string[]): DayValue[] {
  return dates.map((date) => {
    const entry = byDate.get(date);
    return { date, views: entry?.views ?? 0, uniqueVisitors: entry?.uniqueVisitors ?? 0 };
  });
}

function sumMetric(series: DayValue[], metric: Metric): number {
  return series.reduce((total, day) => total + metricValue(day, metric), 0);
}

function pctDelta(current: number, prior: number): number {
  if (prior <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 100);
}

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

const FULL_WINDOW = 60;

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
                <h1 className="text-lg font-semibold">Guild Analytics</h1>
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
                <span className="text-xs text-muted-foreground">across {summary.instances.length} tracked instances</span>
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

            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] items-start">
              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border p-5">
                  <h2 className="font-semibold">Top instances &middot; {range}D</h2>
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
                            <div className="font-wow min-w-0 flex-1 truncate text-sm font-semibold">{instance.name}</div>
                            <div className="flex h-4 w-20 shrink-0 items-end gap-px">
                              {instance.series.map((day) => {
                                const value = metricValue(day, metric);
                                return (
                                  <div
                                    key={day.date}
                                    title={`${formatDayTitle(day.date)} — ${numberFormatter.format(value)} ${METRIC_UNIT[metric]}`}
                                    className="min-w-0 flex-1 rounded-[1px]"
                                    style={{ height: `${Math.max(18, (value / instance.seriesMax) * 100)}%`, background: instance.color }}
                                  />
                                );
                              })}
                            </div>
                            <div className="min-w-[100px] shrink-0 text-right">
                              <div className="font-mono text-sm">{compactFormatter.format(instance.total)}</div>
                              <DeltaLabel pct={instance.deltaPct} range={range} compact />
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-5 pb-4 pl-11">
                              <div className="flex h-16 items-end gap-1 mb-2">
                                {instance.series.map((day) => {
                                  const value = metricValue(day, metric);
                                  return (
                                    <div
                                      key={day.date}
                                      title={`${formatDayTitle(day.date)} — ${numberFormatter.format(value)} ${METRIC_UNIT[metric]}`}
                                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                                    >
                                      <div
                                        className="w-full max-w-[18px] rounded-t opacity-85"
                                        style={{ height: `${Math.max(6, (value / instance.seriesMax) * 100)}%`, background: instance.color }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <Link to={`/instances/${instance.key}`} className="text-xs text-amber-500 hover:text-amber-400">
                                Open instance page &rarr;
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-4 font-semibold">Top 5 &middot; {range}D</h2>
                {summary.top5.length === 0 ? (
                  <EmptyAnalytics />
                ) : (
                  <>
                    <Podium entries={summary.top5.slice(0, 3)} />
                    {summary.top5.slice(3, 5).map((entry, idx) => (
                      <Link
                        key={entry.key}
                        to={`/instances/${entry.key}`}
                        className="flex items-center gap-2.5 border-t border-border px-1 py-2 text-sm transition-colors hover:bg-muted/20 -mx-1"
                      >
                        <div className="w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">{idx + 4}</div>
                        <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
                        <div className="font-wow min-w-0 flex-1 truncate text-muted-foreground">{entry.name}</div>
                        <div className="font-mono text-xs">{compactFormatter.format(entry.total)}</div>
                      </Link>
                    ))}
                  </>
                )}
              </section>
            </div>

            <p className="text-xs text-muted-foreground">
              Unique views use a first-party browser cookie and are deduplicated per resource per UTC day. Counts may differ when visitors clear cookies or use another browser.
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

function DeltaLabel({ pct, range, compact }: { pct: number; range: number; compact?: boolean }) {
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className={cn("flex items-center gap-1 text-xs", pct >= 0 ? "text-emerald-500" : "text-muted-foreground", compact && "justify-end")}>
      <Icon className="h-3 w-3" />
      {pct >= 0 ? "+" : ""}{pct}% {!compact && `vs prior ${range}d`}
    </div>
  );
}

const MEDAL = [
  { emoji: "🥇", ring: "border-yellow-500/40", text: "text-yellow-400", h: "h-[92px]" },
  { emoji: "🥈", ring: "border-slate-400/30", text: "text-slate-300", h: "h-[70px]" },
  { emoji: "🥉", ring: "border-amber-700/30", text: "text-amber-600", h: "h-[58px]" },
] as const;
const PODIUM_ORDER = [1, 0, 2] as const;

function Podium({ entries }: { entries: InstanceSummary[] }) {
  return (
    <div className="mb-2 flex items-end justify-center gap-2">
      {PODIUM_ORDER.map((rank) => {
        const entry = entries[rank];
        const medal = MEDAL[rank];
        if (!entry) return <div key={rank} className="flex-1" />;
        return (
          <Link
            key={entry.key}
            to={`/instances/${entry.key}`}
            className="flex flex-1 flex-col items-center gap-2 text-center"
          >
            <div
              className={cn("flex items-center justify-center rounded-full border-2", rank === 0 ? "h-12 w-12 text-xl" : "h-10 w-10 text-base", medal.ring)}
              style={{ background: `radial-gradient(circle at 35% 30%, ${entry.color}55, transparent)` }}
            >
              {medal.emoji}
            </div>
            <div className="font-wow w-full min-w-0 truncate text-xs font-semibold">{entry.name}</div>
            <div className={cn("flex w-full flex-col items-center justify-center rounded-t-lg border", medal.h, rank === 0 ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/20")}>
              <div className="font-semibold tabular-nums">{compactFormatter.format(entry.total)}</div>
              <div className="mt-0.5 text-[9px] tracking-wide text-muted-foreground">RANK {rank + 1}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function EmptyAnalytics() {
  return <div className="py-8 text-center text-sm text-muted-foreground">No views recorded yet.</div>;
}

interface InstanceSummary {
  key: string;
  name: string;
  color: string;
  total: number;
  deltaPct: number;
  series: DayValue[];
  seriesMax: number;
}

function buildSummary(rows: readonly GuildResourceAnalyticsDay[], range: RangeDays, metric: Metric) {
  const guildPageByDate = new Map<string, { views: number; uniqueVisitors: number }>();
  const instanceNames = new Map<string, string>();
  const instanceByDate = new Map<string, Map<string, { views: number; uniqueVisitors: number }>>();

  for (const row of rows) {
    if (row.resource_kind === "guild_page") {
      const cur = guildPageByDate.get(row.viewed_on) ?? { views: 0, uniqueVisitors: 0 };
      cur.views += row.views;
      cur.uniqueVisitors += row.unique_visitors;
      guildPageByDate.set(row.viewed_on, cur);
    } else if (row.resource_kind === "instance") {
      instanceNames.set(row.resource_key, row.resource_name);
      let byDate = instanceByDate.get(row.resource_key);
      if (!byDate) {
        byDate = new Map();
        instanceByDate.set(row.resource_key, byDate);
      }
      const cur = byDate.get(row.viewed_on) ?? { views: 0, uniqueVisitors: 0 };
      cur.views += row.views;
      cur.uniqueVisitors += row.unique_visitors;
      byDate.set(row.viewed_on, cur);
    }
  }

  const fullWindow = buildDates(FULL_WINDOW);
  const currentDates = fullWindow.slice(-range);
  const priorDates = fullWindow.slice(-(range * 2), -range);

  const guildSeries = seriesFor(guildPageByDate, currentDates);
  const guildMax = Math.max(1, ...guildSeries.map((d) => metricValue(d, metric)));
  const guildPeakIdx = guildSeries.reduce(
    (best, day, idx) => (metricValue(day, metric) > metricValue(guildSeries[best], metric) ? idx : best),
    0,
  );
  const guildTotal = sumMetric(guildSeries, metric);
  const guildPriorTotal = sumMetric(seriesFor(guildPageByDate, priorDates), metric);

  const instances: InstanceSummary[] = [...instanceNames.entries()]
    .map(([key, name]) => {
      const byDate = instanceByDate.get(key) ?? new Map();
      const series = seriesFor(byDate, currentDates);
      return {
        key,
        name,
        color: getInstanceAccentColor(name),
        total: sumMetric(series, metric),
        deltaPct: pctDelta(sumMetric(series, metric), sumMetric(seriesFor(byDate, priorDates), metric)),
        series,
        seriesMax: Math.max(1, ...series.map((d) => metricValue(d, metric))),
      };
    })
    .sort((a, b) => b.total - a.total);

  const instanceTotalAll = instances.reduce((total, inst) => total + inst.total, 0);
  const busiestDay = guildTotal > 0 ? guildSeries[guildPeakIdx] : null;

  return {
    guildSeries,
    guildMax,
    guildPeakIdx,
    guildTotal,
    guildDeltaPct: pctDelta(guildTotal, guildPriorTotal),
    instances,
    instanceTotalAll,
    busiestDay,
    top5: instances.slice(0, 5),
  };
}
