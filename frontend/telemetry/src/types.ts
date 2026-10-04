/** Mirrors the Go TelemetryReport struct from servicetelemetry/worker.go */
export interface TelemetryReport {
  deployment_id: string;
  deployment_created_at: string;
  version: string;
  git_commit: string;
  server_type: string;
  access_url: string;
  hostname: string;
  os: string;
  arch: string;
  uptime_seconds: number;
  started_at: string;
  total_users: number;
  total_log_files: number;
  total_parsed_log_bytes: number;
  active_file_bytes: number;
  deleted_file_bytes: number;
  instances_by_zone: Record<string, number>;
}

export interface Env {
  DB: D1Database;
}

export type NoticeAudience = "public" | "admin";
export type NoticeCategory =
  | "compliance"
  | "release"
  | "maintenance"
  | "announcement";
export type NoticeSeverity = "info" | "warning" | "critical";

export interface Notice {
  id: number;
  deployment_id: string | null;
  audience: NoticeAudience;
  category: NoticeCategory;
  severity: NoticeSeverity;
  title: string;
  message: string;
  action_label: string | null;
  action_url: string | null;
  enabled: number;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoticeInput {
  deployment_id: string | null;
  audience: NoticeAudience;
  category: NoticeCategory;
  severity: NoticeSeverity;
  title: string;
  message: string;
  action_label?: string | null;
  action_url?: string | null;
  enabled: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
}

export interface DeploymentLatest {
  deployment_id: string;
  last_report_id: number | null;
  last_reported_at: string;
  version: string;
  server_type: string;
  access_url: string;
  is_dev: number;
  token_hash: string;
}

/**
 * DeploymentLatest joined with host metadata from the latest report
 * (telemetry_reports via last_report_id).
 */
export interface DeploymentLatestWithHost extends DeploymentLatest {
  remote_ip: string;
  hostname: string;
  os: string;
  arch: string;
}

export interface StoredReport {
  id: number;
  deployment_id: string;
  deployment_created_at: string | null;
  version: string;
  git_commit: string;
  server_type: string;
  access_url: string;
  hostname: string;
  os: string;
  arch: string;
  uptime_seconds: number;
  started_at: string | null;
  total_users: number;
  total_log_files: number;
  total_parsed_log_bytes: number;
  active_file_bytes: number;
  deleted_file_bytes: number;
  instances_by_zone: string;
  reported_at: string;
  remote_ip: string;
}
