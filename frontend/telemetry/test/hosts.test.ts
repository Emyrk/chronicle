import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHostChangeWindows,
  buildHostRows,
  buildHostTrends,
} from "../src/analytics/hosts.ts";

test("builds total and non-China server growth", () => {
  const rows = buildHostRows(
    [{ hostname: "octo.chronicleclassic.com", pageViews: 120, activeUsers: 20, sessions: 30 }],
    new Map([["octo.chronicleclassic.com", 100]]),
    new Map([["octo.chronicleclassic.com", 30]]),
    new Map([["octo.chronicleclassic.com", 20]]),
    new Map([[
      "octo.chronicleclassic.com",
      { change7dPercent: 40, change14dPercent: 30, change30dPercent: 20 },
    ]]),
    new Map([["octo.chronicleclassic.com", [10, 20, 30]]])
  );

  assert.deepEqual(rows, [{
    hostname: "octo.chronicleclassic.com",
    pageViews: 120,
    previousPageViews: 100,
    changePercent: 20,
    change7dPercent: 40,
    change14dPercent: 30,
    change30dPercent: 20,
    trend30d: [10, 20, 30],
    activeUsers: 20,
    sessions: 30,
    nonChinaPageViews: 90,
    previousNonChinaPageViews: 80,
    nonChinaChangePercent: 12.5,
    chinaPageViews: 30,
    chinaShare: 0.25,
  }]);
});

test("builds fixed 7, 14, and 30 day server comparisons", () => {
  const rows = [];
  for (let offset = 0; offset < 60; offset += 1) {
    const date = new Date(Date.UTC(2026, 9, 27 - offset)).toISOString().slice(0, 10);
    rows.push({
      date,
      hostname: "octo.chronicleclassic.com",
      pageViews: offset < 7 ? 20 : offset < 14 ? 10 : offset < 30 ? 15 : 10,
    });
  }

  assert.deepEqual(
    buildHostChangeWindows(rows, "2026-10-27").get("octo.chronicleclassic.com"),
    {
      change7dPercent: 100,
      change14dPercent: 0,
      change30dPercent: 50,
    }
  );
});

test("builds oldest-to-newest server sparkline points", () => {
  const rows = [
    { date: "2026-10-27", hostname: "octo.chronicleclassic.com", pageViews: 30 },
    { date: "2026-10-25", hostname: "octo.chronicleclassic.com", pageViews: 10 },
    { date: "2026-10-25", hostname: "octo.chronicleclassic.com", pageViews: 5 },
  ];

  assert.deepEqual(
    buildHostTrends(rows, "2026-10-27", 4).get("octo.chronicleclassic.com"),
    [0, 15, 0, 30]
  );
});

test("handles new servers and missing China rows", () => {
  const [row] = buildHostRows(
    [{ hostname: "new.chronicleclassic.com", pageViews: 12, activeUsers: 3, sessions: 4 }],
    new Map(),
    new Map(),
    new Map()
  );

  assert.equal(row.changePercent, null);
  assert.equal(row.change7dPercent, null);
  assert.equal(row.change14dPercent, null);
  assert.equal(row.change30dPercent, null);
  assert.deepEqual(row.trend30d, []);
  assert.equal(row.nonChinaChangePercent, null);
  assert.equal(row.nonChinaPageViews, 12);
  assert.equal(row.chinaPageViews, 0);
  assert.equal(row.chinaShare, 0);
});
