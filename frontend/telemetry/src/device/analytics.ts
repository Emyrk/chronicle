import type { AnalyticsDashboard } from "../analytics/types";
import type { DeviceOperations } from "../operations/victoria";

export interface DeviceAnalyticsDashboard {
  schemaVersion: 5;
  contentHash: string;
  generatedAt: string;
  timezone: string;
  mock: boolean;
  period: AnalyticsDashboard["period"];
  overview: AnalyticsDashboard["overview"];
  trend: Array<{
    date: string;
    pageViews: number;
    activeUsers: number;
  }>;
  topHost: {
    hostname: string;
    pageViews: number;
    activeUsers: number;
    sessions: number;
  } | null;
  topProduct: {
    id: string;
    label: string;
    pageViews: number;
    share: number;
  } | null;
  operations: DeviceOperations | null;
  servers: Array<{
    hostname: string;
    pageViews: number;
    previousPageViews: number;
    changePercent: number | null;
    change7dPercent: number | null;
    change14dPercent: number | null;
    change30dPercent: number | null;
    trend30d: number[];
    nonChinaPageViews: number;
    previousNonChinaPageViews: number;
    nonChinaChangePercent: number | null;
    chinaPageViews: number;
    chinaShare: number;
  }>;
}

export type DeviceAnalyticsWithoutHash = Omit<DeviceAnalyticsDashboard, "contentHash">;

export type DeviceAnalyticsPeriod = 7 | 30 | 90;

export function deviceAnalyticsPeriod(
  value: string | undefined
): DeviceAnalyticsPeriod | null {
  if (value === undefined) return 30;
  const days = Number(value);
  return days === 7 || days === 30 || days === 90 ? days : null;
}

export function projectDeviceAnalytics(
  dashboard: AnalyticsDashboard,
  operations: DeviceOperations | null = null
): DeviceAnalyticsWithoutHash {
  return {
    schemaVersion: 5,
    generatedAt: dashboard.generatedAt,
    timezone: dashboard.timezone,
    mock: dashboard.mock,
    period: dashboard.period,
    overview: dashboard.overview,
    trend: dashboard.timeseries.map(({ date, pageViews, activeUsers }) => ({
      date,
      pageViews,
      activeUsers,
    })),
    topHost: dashboard.hosts[0] ?? null,
    topProduct: dashboard.productFamilies[0] ?? null,
    operations,
    servers: dashboard.hosts.slice(0, 11).map((host) => ({
      hostname: host.hostname,
      pageViews: host.pageViews,
      previousPageViews: host.previousPageViews,
      changePercent: host.changePercent,
      change7dPercent: host.change7dPercent,
      change14dPercent: host.change14dPercent,
      change30dPercent: host.change30dPercent,
      trend30d: host.trend30d,
      nonChinaPageViews: host.nonChinaPageViews,
      previousNonChinaPageViews: host.previousNonChinaPageViews,
      nonChinaChangePercent: host.nonChinaChangePercent,
      chinaPageViews: host.chinaPageViews,
      chinaShare: host.chinaShare,
    })),
  };
}

export async function deviceAnalyticsContentHash(
  dashboard: DeviceAnalyticsWithoutHash
): Promise<string> {
  const stableDashboard = { ...dashboard, generatedAt: undefined };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(stableDashboard))
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
