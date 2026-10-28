import type { AnalyticsHostRow } from "./types";

export interface CurrentHostMetrics {
  hostname: string;
  pageViews: number;
  activeUsers: number;
  sessions: number;
}

function changePercent(value: number, previous: number): number | null {
  return previous === 0 ? null : ((value - previous) / previous) * 100;
}

export function buildHostRows(
  currentHosts: CurrentHostMetrics[],
  previousPageViews: Map<string, number>,
  currentChinaPageViews: Map<string, number>,
  previousChinaPageViews: Map<string, number>
): AnalyticsHostRow[] {
  return currentHosts.map((host) => {
    const previous = previousPageViews.get(host.hostname) ?? 0;
    const china = currentChinaPageViews.get(host.hostname) ?? 0;
    const previousChina = previousChinaPageViews.get(host.hostname) ?? 0;
    const nonChina = Math.max(host.pageViews - china, 0);
    const previousNonChina = Math.max(previous - previousChina, 0);

    return {
      ...host,
      previousPageViews: previous,
      changePercent: changePercent(host.pageViews, previous),
      nonChinaPageViews: nonChina,
      previousNonChinaPageViews: previousNonChina,
      nonChinaChangePercent: changePercent(nonChina, previousNonChina),
      chinaPageViews: china,
      chinaShare: host.pageViews === 0 ? 0 : china / host.pageViews,
    };
  });
}
