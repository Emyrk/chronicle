import { Hono, type Context } from "hono";
import { NoticeValidationError, validateNoticeInput } from "../notices";
import type {
  Env,
  DeploymentLatestWithHost,
  Notice,
  StoredReport,
} from "../types";

const api = new Hono<{ Bindings: Env }>();

// List all deployments (latest report per deployment). Host metadata
// (remote_ip, hostname, os, arch) comes from the latest report so it works
// for rows ingested before those columns were tracked on the report.
api.get("/internal/api/v1/deployments", async (c) => {
  const serverType = c.req.query("server_type");
  const db = c.env.DB;

  let query = `SELECT dl.deployment_id, dl.last_report_id, dl.last_reported_at,
       dl.version, dl.server_type, dl.access_url, dl.is_dev,
       r.remote_ip, r.hostname, r.os, r.arch
     FROM deployment_latest dl
     JOIN telemetry_reports r ON r.id = dl.last_report_id`;
  const binds: string[] = [];

  if (serverType) {
    query += " WHERE dl.server_type = ?";
    binds.push(serverType);
  }
  query += " ORDER BY dl.last_reported_at DESC";

  const { results } = await db
    .prepare(query)
    .bind(...binds)
    .all<DeploymentLatestWithHost>();

  return c.json({ deployments: results ?? [] });
});

// Report history for a single deployment.
api.get("/internal/api/v1/deployments/:id", async (c) => {
  const deploymentId = c.req.param("id");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);

  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT * FROM telemetry_reports
       WHERE deployment_id = ?
       ORDER BY reported_at DESC
       LIMIT ?`
    )
    .bind(deploymentId, limit)
    .all<StoredReport>();

  return c.json({ deployment_id: deploymentId, reports: results ?? [] });
});

// Aggregate stats.
api.get("/internal/api/v1/stats", async (c) => {
  const db = c.env.DB;

  const [totalDeploy, active7d, active30d, byVersion, byServerType, totals] =
    await Promise.all([
      db
        .prepare("SELECT COUNT(*) as count FROM deployment_latest WHERE last_report_id IS NOT NULL")
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM deployment_latest
           WHERE last_report_id IS NOT NULL
             AND last_reported_at >= datetime('now', '-7 days')`
        )
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM deployment_latest
           WHERE last_report_id IS NOT NULL
             AND last_reported_at >= datetime('now', '-30 days')`
        )
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT dl.version, COUNT(*) as count
           FROM deployment_latest dl
           WHERE dl.last_report_id IS NOT NULL
           GROUP BY dl.version
           ORDER BY count DESC`
        )
        .all<{ version: string; count: number }>(),
      db
        .prepare(
          `SELECT dl.server_type, COUNT(*) as count
           FROM deployment_latest dl
           WHERE dl.last_report_id IS NOT NULL
           GROUP BY dl.server_type
           ORDER BY count DESC`
        )
        .all<{ server_type: string; count: number }>(),
      db
        .prepare(
          `SELECT
             COALESCE(SUM(r.total_users), 0) as total_users,
             COALESCE(SUM(r.total_log_files), 0) as total_log_files
           FROM deployment_latest dl
           JOIN telemetry_reports r ON r.id = dl.last_report_id`
        )
        .first<{ total_users: number; total_log_files: number }>(),
    ]);

  return c.json({
    deployments: {
      total: totalDeploy?.count ?? 0,
      active_7d: active7d?.count ?? 0,
      active_30d: active30d?.count ?? 0,
    },
    by_version: byVersion.results ?? [],
    by_server_type: byServerType.results ?? [],
    totals: {
      total_users: totals?.total_users ?? 0,
      total_log_files: totals?.total_log_files ?? 0,
    },
  });
});

// Toggle dev flag on a deployment.
api.post("/internal/api/v1/deployments/:id/dev", async (c) => {
  const deploymentId = c.req.param("id");
  const body = await c.req.json<{ is_dev: boolean }>();
  const db = c.env.DB;

  await db
    .prepare("UPDATE deployment_latest SET is_dev = ? WHERE deployment_id = ?")
    .bind(body.is_dev ? 1 : 0, deploymentId)
    .run();

  return c.json({ deployment_id: deploymentId, is_dev: body.is_dev });
});

api.get("/internal/api/v1/notices", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM notices
     ORDER BY enabled DESC,
       CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       created_at DESC`
  ).all<Notice>();
  return c.json({ notices: results ?? [] });
});

async function readNoticeInput(c: Context<{ Bindings: Env }>) {
  try {
    return validateNoticeInput(await c.req.json<unknown>());
  } catch (error) {
    if (error instanceof NoticeValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Invalid JSON" }, 400);
  }
}

api.post("/internal/api/v1/notices", async (c) => {
  const input = await readNoticeInput(c);
  if (input instanceof Response) return input;

  const deployment = await c.env.DB.prepare(
    "SELECT 1 FROM deployment_latest WHERE deployment_id = ? AND last_report_id IS NOT NULL"
  )
    .bind(input.deployment_id)
    .first();
  if (!deployment) return c.json({ error: "Deployment not found" }, 400);

  const result = await c.env.DB.prepare(
    `INSERT INTO notices
      (deployment_id, audience, category, severity, title, message,
       action_label, action_url, enabled, starts_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.deployment_id,
      input.audience,
      input.category,
      input.severity,
      input.title,
      input.message,
      input.action_label ?? null,
      input.action_url ?? null,
      input.enabled ? 1 : 0,
      input.starts_at ?? null,
      input.expires_at ?? null
    )
    .run();

  const notice = await c.env.DB.prepare("SELECT * FROM notices WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Notice>();
  return c.json({ notice }, 201);
});

api.put("/internal/api/v1/notices/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return c.json({ error: "Invalid notice ID" }, 400);
  }

  const input = await readNoticeInput(c);
  if (input instanceof Response) return input;

  const deployment = await c.env.DB.prepare(
    "SELECT 1 FROM deployment_latest WHERE deployment_id = ? AND last_report_id IS NOT NULL"
  )
    .bind(input.deployment_id)
    .first();
  if (!deployment) return c.json({ error: "Deployment not found" }, 400);

  const result = await c.env.DB.prepare(
    `UPDATE notices SET
       deployment_id = ?, audience = ?, category = ?, severity = ?,
       title = ?, message = ?, action_label = ?, action_url = ?, enabled = ?,
       starts_at = ?, expires_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      input.deployment_id,
      input.audience,
      input.category,
      input.severity,
      input.title,
      input.message,
      input.action_label ?? null,
      input.action_url ?? null,
      input.enabled ? 1 : 0,
      input.starts_at ?? null,
      input.expires_at ?? null,
      id
    )
    .run();
  if (result.meta.changes === 0) return c.json({ error: "Notice not found" }, 404);

  const notice = await c.env.DB.prepare("SELECT * FROM notices WHERE id = ?")
    .bind(id)
    .first<Notice>();
  return c.json({ notice });
});

api.delete("/internal/api/v1/notices/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return c.json({ error: "Invalid notice ID" }, 400);
  }
  const result = await c.env.DB.prepare("DELETE FROM notices WHERE id = ?")
    .bind(id)
    .run();
  if (result.meta.changes === 0) return c.json({ error: "Notice not found" }, 404);
  return c.json({ deleted: true });
});

export default api;
