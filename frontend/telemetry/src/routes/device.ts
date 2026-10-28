import { Hono } from "hono";
import { fetchAnalyticsDashboard } from "../analytics/client";
import { createMockAnalyticsDashboard } from "../analytics/mock";
import {
  deviceAnalyticsContentHash,
  deviceAnalyticsPeriod,
  projectDeviceAnalytics,
} from "../device/analytics";
import type { Env } from "../types";

const device = new Hono<{ Bindings: Env }>();

device.get("/device/api/v1/analytics/dashboard", async (c) => {
  const requestedDays = deviceAnalyticsPeriod(c.req.query("days"));
  if (requestedDays === null) {
    return c.json({ error: "days must be one of 7, 30, or 90" }, 400);
  }

  try {
    const analytics = c.env.ANALYTICS_MOCK === "true"
      ? createMockAnalyticsDashboard(requestedDays)
      : await fetchAnalyticsDashboard(c.env, requestedDays);
    const projected = projectDeviceAnalytics(analytics);
    const contentHash = await deviceAnalyticsContentHash(projected);
    const etag = `"${contentHash}"`;

    c.header("Cache-Control", "private, max-age=300");
    c.header("ETag", etag);
    c.header("Vary", "CF-Access-Client-Id, CF-Access-Client-Secret");
    if (c.req.header("If-None-Match") === etag) {
      return c.body(null, 304);
    }

    return c.json({ ...projected, contentHash });
  } catch (error) {
    console.error("device analytics dashboard failed", error);
    c.header("Cache-Control", "private, no-store");
    return c.json({ error: "Unable to load device analytics" }, 502);
  }
});

export default device;
