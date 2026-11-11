import type { AnalyticsDashboard } from "./types";

export function shiftDate(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function exactPeriod(days: number, timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return {
    days,
    start: shiftDate(today, -days),
    end: shiftDate(today, -1),
    previousStart: shiftDate(today, -2 * days),
    previousEnd: shiftDate(today, -days - 1),
  };
}
// Self-contained so the exact tested projection can also run in the inline dashboard.
export function compareDashboard(
  data: AnalyticsDashboard,
  selected: string[],
  normalized = false,
) {
  const hosts = data.hosts.filter((h) => selected.includes(h.hostname));
  const all = data.hosts.every((h) => selected.includes(h.hostname));
  const current = hosts.reduce((sum, h) => sum + h.pageViews, 0);
  const previous = hosts.reduce((sum, h) => sum + h.previousPageViews, 0);
  const change = (value: number, before: number) => ({
    delta: value - before,
    percent: before === 0 ? null : ((value - before) / before) * 100,
  });
  const hostMetric = (value: number | undefined, before: number | undefined) =>
    value === undefined
      ? null
      : {
          value,
          previous: before ?? null,
          changePercent:
            before === undefined ? null : change(value, before).percent,
        };
  const metricFor = (
    name: "activeUsers" | "sessions" | "engagedSessions",
    previousName:
      | "previousActiveUsers"
      | "previousSessions"
      | "previousEngagedSessions",
  ) =>
    all
      ? data.overview[name]
      : hosts.length === 1
        ? hostMetric(hosts[0][name], hosts[0][previousName])
        : null;
  const dates: string[] = [];
  for (let i = 0; i < data.period.days; i++) {
    const date = new Date(data.period.start + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + i);
    dates.push(date.toISOString().slice(0, 10));
  }
  const daily = new Map(
    (data.dailyHosts ?? []).map((row) => [
      JSON.stringify([row.hostname, row.date]),
      row.pageViews,
    ]),
  );
  const series = hosts.map((host) => {
    const baseline = host.previousPageViews / data.period.days;
    return {
      hostname: host.hostname,
      baseline,
      values: dates.map((date) => {
        const value = daily.get(JSON.stringify([host.hostname, date])) ?? 0;
        return normalized
          ? baseline === 0
            ? null
            : (value / baseline) * 100
          : value;
      }),
    };
  });
  const pages = (data.pages ?? []).filter((row) =>
    selected.includes(row.hostname),
  );
  const families = new Map<
    string,
    {
      hostname: string;
      path: string;
      pageViews: number;
      previousPageViews: number;
    }
  >();
  for (const page of pages) {
    const key = JSON.stringify([page.hostname, page.family]);
    const row = families.get(key) ?? {
      hostname: page.hostname,
      path: page.family,
      pageViews: 0,
      previousPageViews: 0,
    };
    row.pageViews += page.pageViews;
    row.previousPageViews += page.previousPageViews;
    families.set(key, row);
  }
  const rank = (
    rows: Array<{
      hostname: string;
      path: string;
      pageViews: number;
      previousPageViews: number;
    }>,
  ) =>
    rows
      .map((row) => ({
        ...row,
        share: current === 0 ? 0 : row.pageViews / current,
        previousShare: previous === 0 ? 0 : row.previousPageViews / previous,
        ...change(row.pageViews, row.previousPageViews),
      }))
      .sort(
        (a, b) =>
          b.pageViews - a.pageViews ||
          a.hostname.localeCompare(b.hostname) ||
          a.path.localeCompare(b.path),
      );
  return {
    all,
    current,
    previous,
    ...change(current, previous),
    activeUsers: metricFor("activeUsers", "previousActiveUsers"),
    sessions: metricFor("sessions", "previousSessions"),
    engagedSessions: metricFor("engagedSessions", "previousEngagedSessions"),
    hosts: hosts.map((h) => ({
      ...h,
      metrics: {
        activeUsers: hostMetric(h.activeUsers, h.previousActiveUsers),
        sessions: hostMetric(h.sessions, h.previousSessions),
        engagedSessions: hostMetric(
          h.engagedSessions,
          h.previousEngagedSessions,
        ),
      },
      share: current === 0 ? 0 : h.pageViews / current,
      ...change(h.pageViews, h.previousPageViews),
    })),
    dates,
    series,
    pages: rank(pages),
    families: rank([...families.values()]),
  };
}
