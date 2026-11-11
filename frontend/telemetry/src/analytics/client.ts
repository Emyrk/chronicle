import { exactPeriod, shiftDate } from "./comparison";
import { cached } from "./cache";
import type { Env } from "../types";
import type {
  AnalyticsAcquisitionRow,
  AnalyticsCountryRow,
  AnalyticsDashboard,
  AnalyticsHostRow,
  AnalyticsMetric,
  AnalyticsTimeseriesPoint,
} from "./types";
import {
  buildHostChangeWindows,
  buildHostRows,
  buildHostTrends,
  type CurrentHostMetrics,
  type DatedHostPageViews,
} from "./hosts";
import {
  classifyRoute,
  aggregateLeaderboards,
  aggregateRouteFamilies,
  type LocationPageViewRow,
  type RoutePageViewRow,
} from "./normalize";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const CHRONICLE_HOST_SUFFIX = "chronicleclassic.com";

interface GaRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

interface GaReport {
  rows?: GaRow[];
  rowCount?: number;
  metadata?: { timeZone?: string };
}

interface GaBatchResponse {
  reports?: GaReport[];
}

function base64Url(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function privateKeyBytes(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createAccessToken(
  clientEmail: string,
  privateKey: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: ANALYTICS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Google OAuth failed (${response.status}): ${await response.text()}`,
    );
  }
  const token = await response.json<{ access_token?: string }>();
  if (!token.access_token)
    throw new Error("Google OAuth response did not include an access token");
  return token.access_token;
}

function hostFilter() {
  return {
    orGroup: {
      expressions: [
        {
          filter: {
            fieldName: "hostName",
            stringFilter: {
              matchType: "EXACT",
              value: CHRONICLE_HOST_SUFFIX,
              caseSensitive: false,
            },
          },
        },
        {
          filter: {
            fieldName: "hostName",
            stringFilter: {
              matchType: "ENDS_WITH",
              value: `.${CHRONICLE_HOST_SUFFIX}`,
              caseSensitive: false,
            },
          },
        },
      ],
    },
  };
}

function andFilter(...expressions: object[]) {
  return { andGroup: { expressions } };
}

function leaderboardPathFilter() {
  return {
    filter: {
      fieldName: "pagePath",
      stringFilter: {
        matchType: "FULL_REGEXP",
        value: "^/(leaderboards?|rankings?)(/.*)?$",
        caseSensitive: false,
      },
    },
  };
}

function numberValue(row: GaRow | undefined, index: number): number {
  return Number(row?.metricValues?.[index]?.value ?? 0);
}

function dimensionValue(row: GaRow, index: number): string {
  return row.dimensionValues?.[index]?.value ?? "(not set)";
}

function metric(value: number, previous: number): AnalyticsMetric {
  return {
    value,
    previous,
    changePercent:
      previous === 0 ? null : ((value - previous) / previous) * 100,
  };
}

function parseGaDate(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function requireCompleteReport(
  report: GaReport | undefined,
  label: string,
): GaReport {
  if (!report) throw new Error(`GA4 did not return the ${label} report`);
  const returnedRows = report.rows?.length ?? 0;
  if ((report.rowCount ?? returnedRows) > returnedRows) {
    throw new Error(`GA4 ${label} report exceeded the bounded row limit`);
  }
  return report;
}

function requireOverviewRow(
  report: GaReport | undefined,
  label: string,
  expectedMetricCount: number,
): GaRow {
  const completeReport = requireCompleteReport(report, label);
  const row = completeReport.rows?.[0];
  if (!row && (completeReport.rowCount ?? 0) === 0)
    return {
      metricValues: Array.from({ length: expectedMetricCount }, () => ({
        value: "0",
      })),
    };
  if (!row || (row.metricValues?.length ?? 0) < expectedMetricCount) {
    throw new Error(`GA4 ${label} report did not include the expected metrics`);
  }
  return row;
}

async function loadDashboard(
  env: Env,
  days: number,
  timeZone: string,
  period: AnalyticsDashboard["period"],
): Promise<AnalyticsDashboard> {
  if (
    !env.GA4_PROPERTY_ID ||
    !env.GOOGLE_CLIENT_EMAIL ||
    !env.GOOGLE_PRIVATE_KEY
  ) {
    throw new Error("GA4 credentials are not configured");
  }

  const ranges = {
    current: { startDate: period.start, endDate: period.end },
    previous: { startDate: period.previousStart, endDate: period.previousEnd },
  };
  const metrics = [
    "screenPageViews",
    "activeUsers",
    "sessions",
    "engagedSessions",
  ];
  const accessToken = await createAccessToken(
    env.GOOGLE_CLIENT_EMAIL,
    env.GOOGLE_PRIVATE_KEY,
  );
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:batchRunReports`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            dateRanges: [ranges.current],
            metrics: metrics.map((name) => ({ name })),
            dimensionFilter: hostFilter(),
          },
          {
            dateRanges: [ranges.current],
            dimensions: [{ name: "date" }],
            metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
            dimensionFilter: hostFilter(),
            orderBys: [{ dimension: { dimensionName: "date" } }],
            limit: "100",
          },
          {
            dateRanges: [ranges.current],
            dimensions: [{ name: "hostName" }],
            metrics: [
              { name: "screenPageViews" },
              { name: "activeUsers" },
              { name: "sessions" },
              { name: "engagedSessions" },
            ],
            dimensionFilter: hostFilter(),
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: "50000",
          },
          {
            dateRanges: [ranges.current],
            dimensions: [
              { name: "sessionManualSource" },
              { name: "sessionManualMedium" },
            ],
            metrics: [{ name: "sessions" }, { name: "engagedSessions" }],
            dimensionFilter: hostFilter(),
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
            limit: "10",
          },
          {
            dateRanges: [ranges.current],
            dimensions: [{ name: "country" }],
            metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
            dimensionFilter: hostFilter(),
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: "10",
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `GA4 report failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json<GaBatchResponse>();
  const productResponse = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:batchRunReports`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            dateRanges: [ranges.previous],
            metrics: metrics.map((name) => ({ name })),
            dimensionFilter: hostFilter(),
          },
          {
            dateRanges: [ranges.current],
            dimensions: [{ name: "hostName" }, { name: "pagePath" }],
            metrics: [{ name: "screenPageViews" }],
            dimensionFilter: hostFilter(),
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: "50000",
          },
          {
            dateRanges: [ranges.current],
            dimensions: [{ name: "hostName" }, { name: "pageLocation" }],
            metrics: [{ name: "screenPageViews" }],
            dimensionFilter: andFilter(hostFilter(), leaderboardPathFilter()),
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: "50000",
          },
          {
            dateRanges: [ranges.previous],
            dimensions: [{ name: "hostName" }, { name: "pagePath" }],
            metrics: [{ name: "screenPageViews" }],
            dimensionFilter: hostFilter(),
            limit: "50000",
          },
        ],
      }),
    },
  );
  if (!productResponse.ok) {
    throw new Error(
      `GA4 product report failed (${productResponse.status}): ${await productResponse.text()}`,
    );
  }
  const productPayload = await productResponse.json<GaBatchResponse>();

  const serverResponse = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:batchRunReports`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            dateRanges: [ranges.previous],
            dimensions: [{ name: "hostName" }],
            metrics: metrics.map((name) => ({ name })),
            dimensionFilter: hostFilter(),
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: "50000",
          },
          {
            dateRanges: [ranges.current],
            dimensions: [{ name: "hostName" }, { name: "country" }],
            metrics: [{ name: "screenPageViews" }],
            dimensionFilter: hostFilter(),
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: "50000",
          },
          {
            dateRanges: [ranges.previous],
            dimensions: [{ name: "hostName" }, { name: "country" }],
            metrics: [{ name: "screenPageViews" }],
            dimensionFilter: hostFilter(),
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: "50000",
          },
          {
            dateRanges: [
              {
                startDate: shiftDate(period.end, -Math.max(days * 2, 60) + 1),
                endDate: period.end,
              },
            ],
            dimensions: [{ name: "date" }, { name: "hostName" }],
            metrics: [{ name: "screenPageViews" }],
            dimensionFilter: hostFilter(),
            orderBys: [{ dimension: { dimensionName: "date" } }],
            limit: "50000",
          },
        ],
      }),
    },
  );
  if (!serverResponse.ok) {
    throw new Error(
      `GA4 server report failed (${serverResponse.status}): ${await serverResponse.text()}`,
    );
  }
  const serverPayload = await serverResponse.json<GaBatchResponse>();

  const [
    overviewReport,
    timeseriesReport,
    hostsReport,
    acquisitionReport,
    countriesReport,
  ] = payload.reports ?? [];
  const [
    previousOverviewReport,
    routesReportRaw,
    leaderboardLocationsReportRaw,
  ] = productPayload.reports ?? [];
  const [
    previousHostsReportRaw,
    currentHostCountriesReportRaw,
    previousHostCountriesReportRaw,
    datedHostsReportRaw,
  ] = serverPayload.reports ?? [];
  const previousHostsReport = requireCompleteReport(
    previousHostsReportRaw,
    "previous hosts",
  );
  const currentHostCountriesReport = requireCompleteReport(
    currentHostCountriesReportRaw,
    "current host-country",
  );
  const previousHostCountriesReport = requireCompleteReport(
    previousHostCountriesReportRaw,
    "previous host-country",
  );
  const datedHostsReport = requireCompleteReport(
    datedHostsReportRaw,
    "dated hosts",
  );
  const routesReport = requireCompleteReport(routesReportRaw, "route-family");
  const leaderboardLocationsReport = requireCompleteReport(
    leaderboardLocationsReportRaw,
    "leaderboard URL",
  );
  const current = requireOverviewRow(
    overviewReport,
    "current overview",
    metrics.length,
  );
  const previous = requireOverviewRow(
    previousOverviewReport,
    "previous overview",
    metrics.length,
  );
  requireCompleteReport(hostsReport, "current hosts");
  requireCompleteReport(timeseriesReport, "daily totals");

  const timeseries: AnalyticsTimeseriesPoint[] = (
    timeseriesReport?.rows ?? []
  ).map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    pageViews: numberValue(row, 0),
    activeUsers: numberValue(row, 1),
  }));
  const currentHosts: CurrentHostMetrics[] = (hostsReport?.rows ?? []).map(
    (row) => ({
      hostname: dimensionValue(row, 0),
      pageViews: numberValue(row, 0),
      activeUsers: numberValue(row, 1),
      sessions: numberValue(row, 2),
    }),
  );
  const previousHostPageViews = new Map(
    (previousHostsReport.rows ?? []).map((row) => [
      dimensionValue(row, 0),
      numberValue(row, 0),
    ]),
  );
  const datedHostPageViews: DatedHostPageViews[] = (
    datedHostsReport.rows ?? []
  ).map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    hostname: dimensionValue(row, 1),
    pageViews: numberValue(row, 0),
  }));
  const hostTrends = buildHostTrends(datedHostPageViews, period.end);
  const hostChangeWindows = buildHostChangeWindows(
    datedHostPageViews,
    period.end,
  );
  const chinaPageViews = (report: GaReport) =>
    new Map(
      (report.rows ?? [])
        .filter((row) => dimensionValue(row, 1) === "China")
        .map((row) => [dimensionValue(row, 0), numberValue(row, 0)]),
    );
  // Include domains with traffic only in the previous period, using the same
  // geography and fixed-window projections as currently active domains.
  for (const hostname of previousHostPageViews.keys()) {
    if (!currentHosts.some((host) => host.hostname === hostname)) {
      currentHosts.push({
        hostname,
        pageViews: 0,
        activeUsers: 0,
        sessions: 0,
      });
    }
  }
  const hosts: AnalyticsHostRow[] = buildHostRows(
    currentHosts,
    previousHostPageViews,
    chinaPageViews(currentHostCountriesReport),
    chinaPageViews(previousHostCountriesReport),
    hostChangeWindows,
    hostTrends,
  );
  const currentHostMetrics = new Map(
    (hostsReport?.rows ?? []).map((row) => [dimensionValue(row, 0), row]),
  );
  const previousHostMetrics = new Map(
    (previousHostsReport.rows ?? []).map((row) => [
      dimensionValue(row, 0),
      row,
    ]),
  );
  for (const host of hosts) {
    host.engagedSessions = numberValue(
      currentHostMetrics.get(host.hostname),
      3,
    );
    host.previousActiveUsers = numberValue(
      previousHostMetrics.get(host.hostname),
      1,
    );
    host.previousSessions = numberValue(
      previousHostMetrics.get(host.hostname),
      2,
    );
    host.previousEngagedSessions = numberValue(
      previousHostMetrics.get(host.hostname),
      3,
    );
  }
  const acquisition: AnalyticsAcquisitionRow[] = (
    acquisitionReport?.rows ?? []
  ).map((row) => {
    const source = dimensionValue(row, 0);
    const medium = dimensionValue(row, 1);
    return {
      source: source === "(not set)" ? "Direct / untagged" : source,
      medium: medium === "(not set)" ? "—" : medium,
      sessions: numberValue(row, 0),
      engagedSessions: numberValue(row, 1),
    };
  });
  const countries: AnalyticsCountryRow[] = (countriesReport?.rows ?? []).map(
    (row) => ({
      country: dimensionValue(row, 0),
      pageViews: numberValue(row, 0),
      activeUsers: numberValue(row, 1),
    }),
  );

  const routeRows: RoutePageViewRow[] = (routesReport?.rows ?? []).map(
    (row) => ({
      hostname: dimensionValue(row, 0),
      path: dimensionValue(row, 1),
      pageViews: numberValue(row, 0),
    }),
  );
  const { productFamilies, serverProducts } = aggregateRouteFamilies(routeRows);
  const routePageViews = productFamilies.reduce(
    (total, family) => total + family.pageViews,
    0,
  );
  const overviewPageViews = numberValue(current, 0);
  if (routePageViews !== overviewPageViews) {
    throw new Error(
      `GA4 route rows did not reconcile to total page views (${routePageViews}/${overviewPageViews})`,
    );
  }
  const leaderboardLocationRows: LocationPageViewRow[] = (
    leaderboardLocationsReport?.rows ?? []
  ).map((row) => ({
    hostname: dimensionValue(row, 0),
    location: dimensionValue(row, 1),
    pageViews: numberValue(row, 0),
  }));
  const leaderboardTotal =
    productFamilies.find((family) => family.id === "leaderboards")?.pageViews ??
    0;
  const leaderboardTotalsByHost = new Map(
    serverProducts.map((server) => [
      server.hostname,
      server.families.leaderboards ?? 0,
    ]),
  );
  const leaderboards = aggregateLeaderboards(
    leaderboardTotal,
    leaderboardTotalsByHost,
    leaderboardLocationRows,
  );

  const previousRoutes = requireCompleteReport(
    productPayload.reports?.[3],
    "previous pages",
  );
  const pageMap = new Map<
    string,
    {
      hostname: string;
      path: string;
      pageViews: number;
      previousPageViews: number;
    }
  >();
  for (const row of routeRows)
    pageMap.set(JSON.stringify([row.hostname, row.path]), {
      ...row,
      previousPageViews: 0,
    });
  for (const row of previousRoutes.rows ?? []) {
    const hostname = dimensionValue(row, 0),
      path = dimensionValue(row, 1);
    const key = JSON.stringify([hostname, path]);
    const entry = pageMap.get(key) ?? {
      hostname,
      path,
      pageViews: 0,
      previousPageViews: 0,
    };
    entry.previousPageViews += numberValue(row, 0);
    pageMap.set(key, entry);
  }
  return {
    pages: [...pageMap.values()].map((row) => ({
      ...row,
      family: classifyRoute(row.path),
    })),
    dailyHosts: datedHostPageViews,
    period,
    generatedAt: new Date().toISOString(),
    timezone: timeZone,
    mock: false,
    overview: {
      pageViews: metric(numberValue(current, 0), numberValue(previous, 0)),
      activeUsers: metric(numberValue(current, 1), numberValue(previous, 1)),
      sessions: metric(numberValue(current, 2), numberValue(previous, 2)),
      engagedSessions: metric(
        numberValue(current, 3),
        numberValue(previous, 3),
      ),
    },
    timeseries,
    hosts,
    acquisition,
    countries,
    productFamilies,
    serverProducts,
    leaderboards,
  };
}

// Discover the property timezone from GA4, never from the Worker's UTC clock.
export async function fetchAnalyticsDashboard(
  env: Env,
  days: number,
): Promise<AnalyticsDashboard> {
  if (![7, 30, 90].includes(days)) throw new Error("Invalid period");
  if (
    !env.GA4_PROPERTY_ID ||
    !env.GOOGLE_CLIENT_EMAIL ||
    !env.GOOGLE_PRIVATE_KEY
  )
    throw new Error("GA4 credentials are not configured");
  const property = env.GA4_PROPERTY_ID;
  const timezone = await cached(`timezone-v1:${property}`, async () => {
    const token = await createAccessToken(
      env.GOOGLE_CLIENT_EMAIL!,
      env.GOOGLE_PRIVATE_KEY!,
    );
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
          metrics: [{ name: "screenPageViews" }],
          limit: "1",
        }),
      },
    );
    if (!response.ok)
      throw new Error(`GA4 timezone lookup failed (${response.status})`);
    const report = await response.json<GaReport>();
    if (!report.metadata?.timeZone)
      throw new Error("GA4 property timezone missing");
    return report.metadata.timeZone;
  });
  const period = exactPeriod(days, timezone);
  return cached(
    `dashboard-v3:${property}:${timezone}:${period.previousStart}:${period.start}:${period.end}`,
    () => loadDashboard(env, days, timezone, period),
  );
}
