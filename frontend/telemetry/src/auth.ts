import type { Env } from "./types";

const MAX_TOKEN_LENGTH = 512;
const MAX_DEPLOYMENT_ID_LENGTH = 128;

export type AuthResult =
  | { ok: true; tokenHash: string }
  | { ok: false; response: Response };

function unauthorized(message: string): AuthResult {
  return {
    ok: false,
    response: Response.json({ error: message }, { status: 401 }),
  };
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > MAX_TOKEN_LENGTH) return null;
  return match[1];
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function timingSafeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function authenticateDeployment(
  env: Env,
  request: Request,
  deploymentId: string,
  allowRegistration: boolean
): Promise<AuthResult> {
  if (
    !deploymentId ||
    deploymentId.length > MAX_DEPLOYMENT_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(deploymentId)
  ) {
    return unauthorized("Invalid deployment credentials");
  }

  const token = bearerToken(request);
  if (!token) return unauthorized("Missing bearer token");
  const tokenHash = await sha256Hex(token);

  let row = await env.DB.prepare(
    "SELECT token_hash FROM deployment_latest WHERE deployment_id = ?"
  )
    .bind(deploymentId)
    .first<{ token_hash: string }>();

  if (!row) {
    if (!allowRegistration) return unauthorized("Unknown deployment");

    await env.DB.prepare(
      `INSERT INTO deployment_latest
        (deployment_id, last_report_id, last_reported_at, version, server_type, access_url, token_hash)
       VALUES (?, NULL, '', '', '', '', ?)
       ON CONFLICT(deployment_id) DO NOTHING`
    )
      .bind(deploymentId, tokenHash)
      .run();

    row = await env.DB.prepare(
      "SELECT token_hash FROM deployment_latest WHERE deployment_id = ?"
    )
      .bind(deploymentId)
      .first<{ token_hash: string }>();
  } else if (!row.token_hash && allowRegistration) {
    await env.DB.prepare(
      `UPDATE deployment_latest
       SET token_hash = ?
       WHERE deployment_id = ? AND token_hash = ''`
    )
      .bind(tokenHash, deploymentId)
      .run();

    row = await env.DB.prepare(
      "SELECT token_hash FROM deployment_latest WHERE deployment_id = ?"
    )
      .bind(deploymentId)
      .first<{ token_hash: string }>();
  }

  if (!row?.token_hash || !timingSafeEqual(row.token_hash, tokenHash)) {
    return unauthorized("Invalid deployment credentials");
  }

  return { ok: true, tokenHash };
}
