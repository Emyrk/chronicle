export interface AnalyticsMetric {
  value: number;
  previous: number;
  changePercent: number | null;
}

export interface AnalyticsTimeseriesPoint {
  date: string;
  pageViews: number;
  activeUsers: number;
}

export interface AnalyticsHostRow {
  hostname: string;
  pageViews: number;
  activeUsers: number;
  sessions: number;
}

export interface AnalyticsAcquisitionRow {
  source: string;
  medium: string;
  sessions: number;
  engagedSessions: number;
}

export interface AnalyticsCountryRow {
  country: string;
  pageViews: number;
  activeUsers: number;
}

export interface AnalyticsProductFamilyRow {
  id: string;
  label: string;
  pageViews: number;
  share: number;
}

export interface AnalyticsServerProductRow {
  hostname: string;
  pageViews: number;
  families: Record<string, number>;
}

export interface AnalyticsLeaderboardRow {
  label: string;
  pageViews: number;
  share: number;
}

export interface AnalyticsLeaderboardServerRow {
  hostname: string;
  totalPageViews: number;
  classifiedPageViews: number;
  coverage: number;
  instances: AnalyticsLeaderboardRow[];
}

export interface AnalyticsLeaderboardBreakdown {
  totalPageViews: number;
  classifiedPageViews: number;
  coverage: number;
  modes: AnalyticsLeaderboardRow[];
  instances: AnalyticsLeaderboardRow[];
  servers: AnalyticsLeaderboardServerRow[];
}

export interface AnalyticsDashboard {
  period: {
    days: number;
    start: string;
    end: string;
    previousStart: string;
    previousEnd: string;
  };
  generatedAt: string;
  timezone: string;
  mock: boolean;
  overview: {
    pageViews: AnalyticsMetric;
    activeUsers: AnalyticsMetric;
    sessions: AnalyticsMetric;
    engagedSessions: AnalyticsMetric;
  };
  timeseries: AnalyticsTimeseriesPoint[];
  hosts: AnalyticsHostRow[];
  acquisition: AnalyticsAcquisitionRow[];
  countries: AnalyticsCountryRow[];
  productFamilies: AnalyticsProductFamilyRow[];
  serverProducts: AnalyticsServerProductRow[];
  leaderboards: AnalyticsLeaderboardBreakdown;
}
