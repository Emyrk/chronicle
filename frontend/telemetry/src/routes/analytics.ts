import { Hono } from "hono";
import { fetchAnalyticsDashboard } from "../analytics/client";
import { createMockAnalyticsDashboard } from "../analytics/mock";
import type { Env } from "../types";

const analytics = new Hono<{ Bindings: Env }>();
const ALLOWED_PERIODS = new Set([7, 30, 90]);

analytics.get("/internal/api/v1/analytics/dashboard", async (c) => {
  const requestedDays = Number(c.req.query("days") ?? 30);
  if (!ALLOWED_PERIODS.has(requestedDays)) {
    return c.json({ error: "days must be one of 7, 30, or 90" }, 400);
  }

  try {
    const dashboard = c.env.ANALYTICS_MOCK === "true"
      ? createMockAnalyticsDashboard(requestedDays)
      : await fetchAnalyticsDashboard(c.env, requestedDays);

    c.header("Cache-Control", "private, max-age=300");
    c.header("Vary", "Cookie");
    return c.json(dashboard);
  } catch (error) {
    console.error("analytics dashboard failed", error);
    c.header("Cache-Control", "private, no-store");
    return c.json({ error: "Unable to load web analytics" }, 502);
  }
});

export default analytics;
