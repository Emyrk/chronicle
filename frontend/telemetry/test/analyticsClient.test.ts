import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

test("GA reports resolve timezone first, use exact completed ranges and retain every hostname", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2025-01-08T01:00:00Z"),
  });
  const compiled = await build({
    entryPoints: [
      fileURLToPath(new URL("../src/analytics/client.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  const { fetchAnalyticsDashboard } = await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputFiles[0].text).toString("base64")
  );
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  let calls = 0;
  const row = (dimensions: string[], metrics: number[]) => ({
    dimensionValues: dimensions.map((value) => ({ value })),
    metricValues: metrics.map((value) => ({ value: String(value) })),
  });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.ok(init.signal);
    if (String(url).includes("oauth2"))
      return Response.json({ access_token: "test" });
    const body = JSON.parse(String(init.body));
    if (String(url).endsWith(":runReport"))
      return Response.json({ metadata: { timeZone: "America/Los_Angeles" } });
    const reports = body.requests.map((request: any) => {
      assert.match(request.dateRanges[0].startDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(request.dateRanges[0].endDate <= "2025-01-06");
      const dims = request.dimensions?.map((d: any) => d.name).join(",") ?? "";
      const previous = request.dateRanges[0].endDate === "2024-12-30";
      const views = previous ? 5 : 10;
      if (dims.includes("hostName")) assert.equal(request.limit, "50000");
      const rows =
        dims === ""
          ? [row([], [views, 4, 3, 2])]
          : dims === "date"
            ? [row(["20250106"], [10, 4])]
            : dims === "hostName"
              ? [
                  row(
                    ["one.chronicleclassic.com"],
                    request.metrics.map((_: any, i: number) =>
                      i === 0 ? views : 4,
                    ),
                  ),
                ]
              : dims === "hostName,pagePath"
                ? [row(["one.chronicleclassic.com", "/"], [views])]
                : dims === "date,hostName"
                  ? [row(["20250106", "one.chronicleclassic.com"], [10])]
                  : [];
      return {
        rows,
        rowCount: rows.length,
        metadata: { timeZone: "America/Los_Angeles" },
      };
    });
    return Response.json({ reports });
  });
  const env = {
    GA4_PROPERTY_ID: "123",
    GOOGLE_CLIENT_EMAIL: "test@example.com",
    GOOGLE_PRIVATE_KEY: privateKey,
  };
  const [first, second] = await Promise.all([
    fetchAnalyticsDashboard(env, 7),
    fetchAnalyticsDashboard(env, 7),
  ]);
  assert.equal(first, second);
  assert.equal(calls, 6); // timezone token + lookup, report token + three batches
  assert.equal(first.period.start, "2024-12-31");
  assert.equal(first.period.end, "2025-01-06");
  assert.equal(first.pages[0].previousPageViews, 5);
  assert.equal(first.dailyHosts[0].date, "2025-01-06");
  assert.equal(first.timezone, "America/Los_Angeles");
  assert.equal(first.hosts[0].engagedSessions, 4);
  assert.equal(first.hosts[0].previousActiveUsers, 4);
  assert.equal(first.hosts[0].previousSessions, 4);
  assert.equal(first.hosts[0].previousEngagedSessions, 4);
});
