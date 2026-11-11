import assert from "node:assert/strict";
import { test } from "node:test";
import { compareDashboard, exactPeriod } from "../src/analytics/comparison.ts";
import { createMockAnalyticsDashboard } from "../src/analytics/mock.ts";

test("completed property-local dates handle timezone midnight, leap dates and DST", () => {
  assert.deepEqual(
    exactPeriod(7, "America/Los_Angeles", new Date("2024-03-01T01:00:00Z")),
    {
      days: 7,
      start: "2024-02-22",
      end: "2024-02-28",
      previousStart: "2024-02-15",
      previousEnd: "2024-02-21",
    },
  );
  assert.equal(
    exactPeriod(7, "America/Los_Angeles", new Date("2024-03-11T12:00:00Z"))
      .start,
    "2024-03-04",
  );
  assert.throws(() => exactPeriod(7, "Not/AZone"));
});
function fixture() {
  const data = createMockAnalyticsDashboard(7);
  data.period = exactPeriod(7, "UTC", new Date("2025-01-08T12:00:00Z"));
  data.hosts = [
    {
      ...data.hosts[0],
      hostname: "a.example",
      pageViews: 70,
      previousPageViews: 35,
      activeUsers: 40,
    },
    {
      ...data.hosts[0],
      hostname: "b.example",
      pageViews: 20,
      previousPageViews: 0,
      activeUsers: 15,
    },
    {
      ...data.hosts[0],
      hostname: "old.example",
      pageViews: 0,
      previousPageViews: 10,
      activeUsers: 0,
    },
  ];
  data.overview.activeUsers = { value: 45, previous: 30, changePercent: 50 };
  data.dailyHosts = [
    { hostname: "a.example", date: "2025-01-01", pageViews: 10 },
  ];
  data.pages = [
    {
      hostname: "a.example",
      path: "/instances/one",
      family: "instance_reports",
      pageViews: 40,
      previousPageViews: 20,
    },
    {
      hostname: "a.example",
      path: "/instances/two",
      family: "instance_reports",
      pageViews: 30,
      previousPageViews: 15,
    },
    {
      hostname: "b.example",
      path: "/",
      family: "home",
      pageViews: 20,
      previousPageViews: 0,
    },
  ];
  return data;
}
test("exact selection preserves true aggregate users, never sums overlapping users", () => {
  const data = fixture();
  assert.equal(
    compareDashboard(
      data,
      data.hosts.map((h) => h.hostname),
    ).activeUsers?.value,
    45,
  );
  assert.equal(
    compareDashboard(data, ["a.example", "b.example"]).activeUsers,
    null,
  );
  assert.equal(compareDashboard(data, ["a.example"]).activeUsers?.value, 40);
  assert.equal(compareDashboard(data, ["example"]).current, 0);
});
test("growth fills completed dates and uses previous daily baseline including absent domains", () => {
  const model = compareDashboard(
    fixture(),
    ["a.example", "b.example", "old.example"],
    true,
  );
  assert.equal(model.dates.length, 7);
  assert.equal(model.series[0].values[0], 200);
  assert.equal(model.series[0].values[1], 0);
  assert.deepEqual(model.series[1].values, Array(7).fill(null));
  assert.equal(model.hosts[1].percent, null);
  assert.equal(model.hosts[2].percent, -100);
  assert.equal(model.delta, 45);
});
test("page rankings and domain-family totals preserve previous shares and filter before denominators", () => {
  const model = compareDashboard(fixture(), ["a.example"]);
  assert.equal(model.families.length, 1);
  assert.equal(model.families[0].pageViews, 70);
  assert.equal(model.families[0].previousPageViews, 35);
  assert.equal(model.pages[0].share, 40 / 70);
  assert.equal(model.pages[0].previousShare, 20 / 35);
  assert.equal(model.pages[0].percent, 100);
});

test("single-domain KPIs compare users and sessions without summing subset audiences", () => {
  const data = fixture();
  Object.assign(data.hosts[0], {
    activeUsers: 40,
    previousActiveUsers: 20,
    sessions: 12,
    previousSessions: 8,
    engagedSessions: 6,
    previousEngagedSessions: 0,
  });
  const single = compareDashboard(data, ["a.example"]);
  assert.deepEqual(single.activeUsers, {
    value: 40,
    previous: 20,
    changePercent: 100,
  });
  assert.deepEqual(single.sessions, {
    value: 12,
    previous: 8,
    changePercent: 50,
  });
  assert.deepEqual(single.engagedSessions, {
    value: 6,
    previous: 0,
    changePercent: null,
  });
  const subset = compareDashboard(data, ["a.example", "b.example"]);
  assert.equal(subset.sessions, null);
  assert.equal(subset.engagedSessions, null);
  assert.equal(subset.hosts[0].metrics.sessions?.previous, 8);
  const all = compareDashboard(
    data,
    data.hosts.map((h) => h.hostname),
  );
  assert.deepEqual(all.sessions, data.overview.sessions);
  assert.deepEqual(all.engagedSessions, data.overview.engagedSessions);
  delete data.hosts[0].previousSessions;
  assert.equal(compareDashboard(data, ["a.example"]).sessions?.previous, null);
  delete data.hosts[0].engagedSessions;
  assert.equal(compareDashboard(data, ["a.example"]).engagedSessions, null);
});
