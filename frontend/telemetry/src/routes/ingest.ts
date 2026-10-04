import { Hono } from "hono";
import { authenticateDeployment } from "../auth";
import { activeNotices } from "../notices";
import type { Env, TelemetryReport } from "../types";

const MAX_BODY_SIZE = 64 * 1024;
const ingest = new Hono<{ Bindings: Env }>();

function payloadTooLarge(contentLength: string | undefined): boolean {
  return Boolean(contentLength && Number(contentLength) > MAX_BODY_SIZE);
}

ingest.post("/api/v1/telemetry/report", async (c) => {
  if (payloadTooLarge(c.req.header("content-length"))) {
    return c.json({ error: "Payload too large" }, 413);
  }

  let report: TelemetryReport;
  try {
    report = await c.req.json<TelemetryReport>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!report.deployment_id || !report.version) {
    return c.json(
      { error: "Missing required fields: deployment_id, version" },
      400
    );
  }

  // Validate and bind credentials before writing the report. Conditional writes in
  // authenticateDeployment ensure only one token can win first registration.
  const auth = await authenticateDeployment(
    c.env,
    c.req.raw,
    report.deployment_id,
    true
  );
  if (!auth.ok) return auth.response;

  const remoteIP = c.req.header("cf-connecting-ip") ?? "";
  const instancesByZone =
    typeof report.instances_by_zone === "object"
      ? JSON.stringify(report.instances_by_zone)
      : "{}";
  const db = c.env.DB;

  const result = await db
    .prepare(
      `INSERT INTO telemetry_reports
        (deployment_id, deployment_created_at, version, git_commit, server_type,
         access_url, hostname, os, arch, uptime_seconds, started_at, total_users,
         total_log_files, total_parsed_log_bytes, active_file_bytes,
         deleted_file_bytes, instances_by_zone, remote_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      report.deployment_id,
      report.deployment_created_at ?? null,
      report.version,
      report.git_commit ?? "",
      report.server_type ?? "",
      report.access_url ?? "",
      report.hostname ?? "",
      report.os ?? "",
      report.arch ?? "",
      report.uptime_seconds ?? 0,
      report.started_at ?? null,
      report.total_users ?? 0,
      report.total_log_files ?? 0,
      report.total_parsed_log_bytes ?? 0,
      report.active_file_bytes ?? 0,
      report.deleted_file_bytes ?? 0,
      instancesByZone,
      remoteIP
    )
    .run();

  await db
    .prepare(
      `UPDATE deployment_latest SET
        last_report_id = ?,
        last_reported_at = datetime('now'),
        version = ?,
        server_type = ?,
        access_url = ?
       WHERE deployment_id = ?`
    )
    .bind(
      result.meta.last_row_id,
      report.version,
      report.server_type ?? "",
      report.access_url ?? "",
      report.deployment_id
    )
    .run();

  return c.json({ notices: await activeNotices(c.env, report.deployment_id) });
});

ingest.post("/api/v1/telemetry/check-notices", async (c) => {
  if (payloadTooLarge(c.req.header("content-length"))) {
    return c.json({ error: "Payload too large" }, 413);
  }

  let body: { deployment_id?: unknown };
  try {
    body = await c.req.json<{ deployment_id?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.deployment_id !== "string" || !body.deployment_id) {
    return c.json({ error: "Missing required field: deployment_id" }, 400);
  }

  const auth = await authenticateDeployment(
    c.env,
    c.req.raw,
    body.deployment_id,
    false
  );
  if (!auth.ok) return auth.response;

  return c.json({ notices: await activeNotices(c.env, body.deployment_id) });
});

export default ingest;
