import type { AnalyticsHostRow } from "./types";

export interface CurrentHostMetrics {
  hostname: string;
  pageViews: number;
  activeUsers: number;
  sessions: number;
}

export interface DatedHostPageViews {
  date: string;
  hostname: string;
  pageViews: number;
}

export interface HostChangeWindows {
  change7dPercent: number | null;
  change14dPercent: number | null;
  change30dPercent: number | null;
}

interface HostWindowTotals {
  current7d: number;
  previous7d: number;
  current14d: number;
  previous14d: number;
  current30d: number;
  previous30d: number;
}

function changePercent(value: number, previous: number): number | null {
  return previous === 0 ? null : ((value - previous) / previous) * 100;
}

export function buildHostChangeWindows(
  rows: DatedHostPageViews[],
  periodEnd: string
): Map<string, HostChangeWindows> {
  const end = Date.parse(`${periodEnd}T00:00:00Z`);
  const totals = new Map<string, HostWindowTotals>();

  for (const row of rows) {
    const day = Date.parse(`${row.date}T00:00:00Z`);
    const offset = Math.round((end - day) / 86_400_000);
    if (!Number.isFinite(offset) || offset < 0 || offset >= 60) continue;

    const host = totals.get(row.hostname) ?? {
      current7d: 0,
      previous7d: 0,
      current14d: 0,
      previous14d: 0,
      current30d: 0,
      previous30d: 0,
    };
    if (offset < 7) host.current7d += row.pageViews;
    else if (offset < 14) host.previous7d += row.pageViews;
    if (offset < 14) host.current14d += row.pageViews;
    else if (offset < 28) host.previous14d += row.pageViews;
    if (offset < 30) host.current30d += row.pageViews;
    else host.previous30d += row.pageViews;
    totals.set(row.hostname, host);
  }

  return new Map(
    Array.from(totals, ([hostname, host]) => [
      hostname,
      {
        change7dPercent: changePercent(host.current7d, host.previous7d),
        change14dPercent: changePercent(host.current14d, host.previous14d),
        change30dPercent: changePercent(host.current30d, host.previous30d),
      },
    ])
  );
}

export function buildHostTrends(
  rows: DatedHostPageViews[],
  periodEnd: string,
  days = 30
): Map<string, number[]> {
  const end = Date.parse(`${periodEnd}T00:00:00Z`);
  const trends = new Map<string, number[]>();

  for (const row of rows) {
    const day = Date.parse(`${row.date}T00:00:00Z`);
    const offset = Math.round((end - day) / 86_400_000);
    if (!Number.isFinite(offset) || offset < 0 || offset >= days) continue;

    const trend = trends.get(row.hostname) ?? Array<number>(days).fill(0);
    trend[days - 1 - offset] += row.pageViews;
    trends.set(row.hostname, trend);
  }

  return trends;
}

export function buildHostRows(
  currentHosts: CurrentHostMetrics[],
  previousPageViews: Map<string, number>,
  currentChinaPageViews: Map<string, number>,
  previousChinaPageViews: Map<string, number>,
  changeWindows: Map<string, HostChangeWindows> = new Map(),
  trends: Map<string, number[]> = new Map()
): AnalyticsHostRow[] {
  return currentHosts.map((host) => {
    const previous = previousPageViews.get(host.hostname) ?? 0;
    const china = currentChinaPageViews.get(host.hostname) ?? 0;
    const previousChina = previousChinaPageViews.get(host.hostname) ?? 0;
    const nonChina = Math.max(host.pageViews - china, 0);
    const previousNonChina = Math.max(previous - previousChina, 0);
    const windows = changeWindows.get(host.hostname) ?? {
      change7dPercent: null,
      change14dPercent: null,
      change30dPercent: null,
    };

    return {
      ...host,
      previousPageViews: previous,
      changePercent: changePercent(host.pageViews, previous),
      ...windows,
      trend30d: trends.get(host.hostname) ?? [],
      nonChinaPageViews: nonChina,
      previousNonChinaPageViews: previousNonChina,
      nonChinaChangePercent: changePercent(nonChina, previousNonChina),
      chinaPageViews: china,
      chinaShare: host.pageViews === 0 ? 0 : china / host.pageViews,
    };
  });
}
