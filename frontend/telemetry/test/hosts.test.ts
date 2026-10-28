import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHostRows } from "../src/analytics/hosts.ts";

test("builds total and non-China server growth", () => {
  const rows = buildHostRows(
    [{ hostname: "octo.chronicleclassic.com", pageViews: 120, activeUsers: 20, sessions: 30 }],
    new Map([["octo.chronicleclassic.com", 100]]),
    new Map([["octo.chronicleclassic.com", 30]]),
    new Map([["octo.chronicleclassic.com", 20]])
  );

  assert.deepEqual(rows, [{
    hostname: "octo.chronicleclassic.com",
    pageViews: 120,
    previousPageViews: 100,
    changePercent: 20,
    activeUsers: 20,
    sessions: 30,
    nonChinaPageViews: 90,
    previousNonChinaPageViews: 80,
    nonChinaChangePercent: 12.5,
    chinaPageViews: 30,
    chinaShare: 0.25,
  }]);
});

test("handles new servers and missing China rows", () => {
  const [row] = buildHostRows(
    [{ hostname: "new.chronicleclassic.com", pageViews: 12, activeUsers: 3, sessions: 4 }],
    new Map(),
    new Map(),
    new Map()
  );

  assert.equal(row.changePercent, null);
  assert.equal(row.nonChinaChangePercent, null);
  assert.equal(row.nonChinaPageViews, 12);
  assert.equal(row.chinaPageViews, 0);
  assert.equal(row.chinaShare, 0);
});
