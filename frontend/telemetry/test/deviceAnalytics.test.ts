import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockAnalyticsDashboard } from "../src/analytics/mock.ts";
import {
  deviceAnalyticsContentHash,
  deviceAnalyticsPeriod,
  projectDeviceAnalytics,
} from "../src/device/analytics.ts";

const operations = {
  status: "healthy" as const,
  healthyReplicas: 2,
  totalReplicas: 2,
  requests24h: 897386,
  requestsChangePercent: -14.8,
  apiP95Ms: 45,
  backlog: 0,
  oldestJobAgeSeconds: 0,
  parseFailures24h: 0,
  encounters24h: 10058,
  parsingSuccessPercent: 100,
  billingAgeSeconds: 180,
  billingCustomersFound: 6,
  billingCustomersSynced: 6,
  billingErrors: 0,
  leaderOk: true,
  gcBacklog: 0,
  requestTrend7d: [120000, 131000, 118000, 143000, 156000, 149000, 132000],
  parsing: {
    instances24h: 228,
    lines24h: 9842738,
    p95Ms: 58500,
    encountersChangePercent: -43.1,
    dailyEncounters7d: [9600, 11200, 10400, 13100, 15500, 14200, 10058],
    topInstances: [
      { name: "Molten Core", count: 138 },
      { name: "Onyxia's Lair", count: 93 },
      { name: "Zul'Gurub", count: 81 },
      { name: "Naxxramas", count: 51 },
      { name: "Lower Tower of Karazhan", count: 51 },
    ],
  },
  jobs: {
    completed24h: 2637,
    cancelled24h: 10,
    configuredWorkers: 17,
    workerUtilizationPercent: 0,
    collectorErrors24h: 0,
    queues: [
      { name: "Log parsing", ready: 0, running: 0, retry: 0, oldestAgeSeconds: 0 },
      { name: "Rankings", ready: 0, running: 0, retry: 0, oldestAgeSeconds: 0 },
    ],
  },
};

test("projects the GA4 dashboard into a compact device payload", () => {
  const source = createMockAnalyticsDashboard(30);
  const projected = projectDeviceAnalytics(source);

  assert.equal(projected.schemaVersion, 5);
  assert.equal(projected.operations, null);
  assert.deepEqual(projected.overview, source.overview);
  assert.equal(projected.trend.length, source.timeseries.length);
  assert.deepEqual(projected.topHost, source.hosts[0]);
  assert.deepEqual(projected.topProduct, source.productFamilies[0]);
  assert.equal(projected.servers.length, source.hosts.length);
  assert.deepEqual(projected.servers[0], {
    hostname: source.hosts[0].hostname,
    pageViews: source.hosts[0].pageViews,
    previousPageViews: source.hosts[0].previousPageViews,
    changePercent: source.hosts[0].changePercent,
    change7dPercent: source.hosts[0].change7dPercent,
    change14dPercent: source.hosts[0].change14dPercent,
    change30dPercent: source.hosts[0].change30dPercent,
    trend30d: source.hosts[0].trend30d,
    nonChinaPageViews: source.hosts[0].nonChinaPageViews,
    previousNonChinaPageViews: source.hosts[0].previousNonChinaPageViews,
    nonChinaChangePercent: source.hosts[0].nonChinaChangePercent,
    chinaPageViews: source.hosts[0].chinaPageViews,
    chinaShare: source.hosts[0].chinaShare,
  });
  assert.equal("hosts" in projected, false);
  assert.equal("countries" in projected, false);
  assert.equal("leaderboards" in projected, false);
});

test("includes compact VictoriaMetrics operations data", () => {
  const projected = projectDeviceAnalytics(
    createMockAnalyticsDashboard(30),
    operations
  );

  assert.deepEqual(projected.operations, operations);
  assert.equal(projected.operations?.jobs.queues[0]?.name, "Log parsing");
  assert.equal(projected.operations?.parsing.topInstances.length, 5);
});

test("content hash ignores fetch time but changes with dashboard data", async () => {
  const source = createMockAnalyticsDashboard(30);
  const first = projectDeviceAnalytics(source);
  const second = {
    ...first,
    generatedAt: new Date(Date.parse(first.generatedAt) + 60_000).toISOString(),
  };
  const changed = {
    ...first,
    overview: {
      ...first.overview,
      pageViews: {
        ...first.overview.pageViews,
        value: first.overview.pageViews.value + 1,
      },
    },
  };

  assert.equal(
    await deviceAnalyticsContentHash(first),
    await deviceAnalyticsContentHash(second)
  );
  assert.notEqual(
    await deviceAnalyticsContentHash(first),
    await deviceAnalyticsContentHash(changed)
  );
});

test("keeps the projected payload small for an embedded client", async () => {
  const projected = projectDeviceAnalytics(
    createMockAnalyticsDashboard(30),
    operations
  );
  const contentHash = await deviceAnalyticsContentHash(projected);

  assert.ok(JSON.stringify({ ...projected, contentHash }).length < 10_000);
});

test("accepts only supported analytics periods", () => {
  assert.equal(deviceAnalyticsPeriod(undefined), 30);
  assert.equal(deviceAnalyticsPeriod("7"), 7);
  assert.equal(deviceAnalyticsPeriod("30"), 30);
  assert.equal(deviceAnalyticsPeriod("90"), 90);
  assert.equal(deviceAnalyticsPeriod("14"), null);
  assert.equal(deviceAnalyticsPeriod("nope"), null);
});
