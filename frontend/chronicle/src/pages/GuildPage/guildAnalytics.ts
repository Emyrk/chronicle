import type { GuildResourceAnalyticsDay } from "@/api/typesGenerated";
import { getInstanceAccentColor } from "@/pages/Logs/utils/instanceImages";

export type Metric = "unique" | "total";
export const METRIC_UNIT: Record<Metric, string> = { unique: "unique views", total: "views" };

interface DayValue {
  date: string;
  views: number;
  uniqueVisitors: number;
}

interface InstanceMemberSummary {
  key: string;
  name: string;
  total: number;
  uniqueVisitors: number;
}

interface InstanceSummary {
  key: string;
  name: string;
  color: string;
  total: number;
  prevTotal: number;
  deltaPct: number;
  series: DayValue[];
  seriesMax: number;
  members: InstanceMemberSummary[];
}

const FULL_WINDOW = 60;

export function metricValue(day: DayValue, metric: Metric): number {
  return metric === "unique" ? day.uniqueVisitors : day.views;
}

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

export function buildSummary(rows: readonly GuildResourceAnalyticsDay[], range: number, metric: Metric) {
  const guildPageByDate = new Map<string, { views: number; uniqueVisitors: number }>();
  const instanceNames = new Map<string, string>();
  const instanceByDate = new Map<string, Map<string, { views: number; uniqueVisitors: number }>>();
  const memberNames = new Map<string, Map<string, string>>();
  const memberByDate = new Map<string, Map<string, Map<string, { views: number; uniqueVisitors: number }>>>();

  for (const row of rows) {
    if (row.resource_kind === "guild_page") {
      const cur = guildPageByDate.get(row.viewed_on) ?? { views: 0, uniqueVisitors: 0 };
      cur.views += row.views;
      cur.uniqueVisitors += row.unique_visitors;
      guildPageByDate.set(row.viewed_on, cur);
    } else if (row.resource_kind === "instance") {
      const groupKey = row.resource_group_key;
      instanceNames.set(groupKey, row.resource_name);
      let byDate = instanceByDate.get(groupKey);
      if (!byDate) {
        byDate = new Map();
        instanceByDate.set(groupKey, byDate);
      }
      const cur = byDate.get(row.viewed_on) ?? { views: 0, uniqueVisitors: 0 };
      cur.views += row.views;
      cur.uniqueVisitors += row.unique_visitors;
      byDate.set(row.viewed_on, cur);
    } else if (row.resource_kind === "instance_member") {
      const groupKey = row.resource_group_key;
      let names = memberNames.get(groupKey);
      if (!names) {
        names = new Map();
        memberNames.set(groupKey, names);
      }
      names.set(row.resource_key, row.resource_name);

      let groupMembers = memberByDate.get(groupKey);
      if (!groupMembers) {
        groupMembers = new Map();
        memberByDate.set(groupKey, groupMembers);
      }
      let byDate = groupMembers.get(row.resource_key);
      if (!byDate) {
        byDate = new Map();
        groupMembers.set(row.resource_key, byDate);
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
  const guildMax = Math.max(1, ...guildSeries.map((day) => metricValue(day, metric)));
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
      const total = sumMetric(series, metric);
      const prevTotal = sumMetric(seriesFor(byDate, priorDates), metric);
      const members = [...(memberNames.get(key) ?? new Map()).entries()]
        .map(([memberKey, memberName]) => {
          const memberSeries = seriesFor(memberByDate.get(key)?.get(memberKey) ?? new Map(), currentDates);
          return {
            key: memberKey,
            name: memberName,
            total: sumMetric(memberSeries, metric),
            uniqueVisitors: sumMetric(memberSeries, "unique"),
          };
        })
        .sort((a, b) => b.total - a.total);
      return {
        key,
        name,
        color: getInstanceAccentColor(name),
        total,
        prevTotal,
        deltaPct: pctDelta(total, prevTotal),
        series,
        seriesMax: Math.max(1, ...series.map((day) => metricValue(day, metric))),
        members,
      };
    })
    .sort((a, b) => b.total - a.total);

  const instanceTotalAll = instances.reduce((total, instance) => total + instance.total, 0);
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
  };
}
