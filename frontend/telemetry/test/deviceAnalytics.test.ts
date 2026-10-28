import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockAnalyticsDashboard } from "../src/analytics/mock.ts";
import {
  deviceAnalyticsContentHash,
  deviceAnalyticsPeriod,
  projectDeviceAnalytics,
} from "../src/device/analytics.ts";

test("projects the GA4 dashboard into a compact device payload", () => {
  const source = createMockAnalyticsDashboard(30);
  const projected = projectDeviceAnalytics(source);

  assert.equal(projected.schemaVersion, 2);
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
  const projected = projectDeviceAnalytics(createMockAnalyticsDashboard(30));
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
