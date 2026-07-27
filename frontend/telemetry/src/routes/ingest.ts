import { Hono } from "hono";
import type { Env, TelemetryReport } from "../types";

const MAX_BODY_SIZE = 64 * 1024; // 64KB

const ingest = new Hono<{ Bindings: Env }>();

ingest.post("/api/v1/telemetry/report", async (c) => {
  const contentLength = c.req.header("content-length");
  if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
    return c.text("Payload too large", 413);
  }

  let report: TelemetryReport;
  try {
    report = await c.req.json<TelemetryReport>();
  } catch {
    return c.text("Invalid JSON", 400);
  }

  if (!report.deployment_id || !report.version) {
    return c.text("Missing required fields: deployment_id, version", 400);
  }

  const remoteIP = c.req.header("cf-connecting-ip") ?? "";
  const instancesByZone =
    typeof report.instances_by_zone === "object"
      ? JSON.stringify(report.instances_by_zone)
      : "{}";

  const db = c.env.DB;

  // Insert the full report.
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

  const reportId = result.meta.last_row_id;

  // Upsert deployment_latest for O(1) latest-per-deployment lookups.
  await db
    .prepare(
      `INSERT INTO deployment_latest
        (deployment_id, last_report_id, last_reported_at, version, server_type, access_url)
       VALUES (?, ?, datetime('now'), ?, ?, ?)
       ON CONFLICT(deployment_id) DO UPDATE SET
        last_report_id = excluded.last_report_id,
        last_reported_at = excluded.last_reported_at,
        version = excluded.version,
        server_type = excluded.server_type,
        access_url = excluded.access_url`
    )
    .bind(
      report.deployment_id,
      reportId,
      report.version,
      report.server_type ?? "",
      report.access_url ?? ""
    )
    .run();

  return c.body(null, 204);
});

export default ingest;
