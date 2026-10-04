import type {
  Env,
  Notice,
  NoticeAudience,
  NoticeCategory,
  NoticeInput,
  NoticeSeverity,
} from "./types";

const AUDIENCES = new Set<NoticeAudience>(["public", "admin"]);
const CATEGORIES = new Set<NoticeCategory>([
  "compliance",
  "release",
  "maintenance",
  "announcement",
]);
const SEVERITIES = new Set<NoticeSeverity>(["info", "warning", "critical"]);
const ALLOWED_ACTION_URLS = [
  "https://chronicleclassic.com",
  "https://github.com/Emyrk/chronicle",
  "https://discord.gg",
] as const;

const LIMITS = {
  deploymentId: 128,
  title: 120,
  message: 2_000,
  actionLabel: 40,
  actionUrl: 500,
} as const;

export class NoticeValidationError extends Error {}

function requiredPlainText(
  value: unknown,
  field: string,
  max: number,
  multiline = false
): string {
  if (typeof value !== "string") {
    throw new NoticeValidationError(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new NoticeValidationError(`${field} must be 1-${max} characters`);
  }
  if (
    /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized) ||
    (!multiline && /[\r\n\t]/.test(normalized))
  ) {
    throw new NoticeValidationError(`${field} must be plain text`);
  }
  return normalized;
}

function optionalPlainText(
  value: unknown,
  field: string,
  max: number
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredPlainText(value, field, max);
}

function optionalTimestamp(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 40) {
    throw new NoticeValidationError(`${field} must be an ISO-8601 timestamp`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new NoticeValidationError(`${field} must be an ISO-8601 timestamp`);
  }
  return new Date(timestamp).toISOString();
}

function actionUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > LIMITS.actionUrl) {
    throw new NoticeValidationError(
      `action_url must be at most ${LIMITS.actionUrl} characters`
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NoticeValidationError("action_url must be a valid URL");
  }

  const allowed = ALLOWED_ACTION_URLS.some((prefix) => {
    const allowedUrl = new URL(prefix);
    if (url.origin !== allowedUrl.origin) return false;
    return (
      allowedUrl.pathname === "/" ||
      url.pathname === allowedUrl.pathname ||
      url.pathname.startsWith(`${allowedUrl.pathname}/`)
    );
  });
  if (!allowed || url.username || url.password) {
    throw new NoticeValidationError("action_url is not an allowed Chronicle URL");
  }
  return url.toString();
}

export function validateNoticeInput(value: unknown): NoticeInput {
  if (!value || typeof value !== "object") {
    throw new NoticeValidationError("Request body must be an object");
  }
  const input = value as Record<string, unknown>;

  const deploymentId = optionalPlainText(
    input.deployment_id,
    "deployment_id",
    LIMITS.deploymentId
  );
  if (!AUDIENCES.has(input.audience as NoticeAudience)) {
    throw new NoticeValidationError("audience must be public or admin");
  }
  if (!CATEGORIES.has(input.category as NoticeCategory)) {
    throw new NoticeValidationError("category is invalid");
  }
  if (!SEVERITIES.has(input.severity as NoticeSeverity)) {
    throw new NoticeValidationError("severity is invalid");
  }
  if (typeof input.enabled !== "boolean") {
    throw new NoticeValidationError("enabled must be a boolean");
  }

  const startsAt = optionalTimestamp(input.starts_at, "starts_at");
  const expiresAt = optionalTimestamp(input.expires_at, "expires_at");
  if (startsAt && expiresAt && startsAt >= expiresAt) {
    throw new NoticeValidationError("expires_at must be after starts_at");
  }

  const label = optionalPlainText(
    input.action_label,
    "action_label",
    LIMITS.actionLabel
  );
  const url = actionUrl(input.action_url);
  if ((label && !url) || (!label && url)) {
    throw new NoticeValidationError(
      "action_label and action_url must be provided together"
    );
  }

  return {
    deployment_id: deploymentId,
    audience: input.audience as NoticeAudience,
    category: input.category as NoticeCategory,
    severity: input.severity as NoticeSeverity,
    title: requiredPlainText(input.title, "title", LIMITS.title),
    message: requiredPlainText(input.message, "message", LIMITS.message, true),
    action_label: label,
    action_url: url,
    enabled: input.enabled,
    starts_at: startsAt,
    expires_at: expiresAt,
  };
}

export async function activeNotices(
  env: Env,
  deploymentId: string
): Promise<Notice[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM notices
     WHERE enabled = 1
       AND (deployment_id IS NULL OR deployment_id = ?)
       AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
       AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
     ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       created_at DESC`
  )
    .bind(deploymentId)
    .all<Notice>();
  return results ?? [];
}
