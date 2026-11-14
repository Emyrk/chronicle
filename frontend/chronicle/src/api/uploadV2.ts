import type { ParserEngine } from "./typesGenerated";

export interface UploadV2Options {
  format: string;
  unlistedLog: boolean;
  flavorOverride?: string;
  hasAdminLogs?: boolean;
  parserEngine?: ParserEngine;
}

/** Shared by single and multi-file uploads; no persisted engine preference. */
export function uploadV2URL({ format, unlistedLog, flavorOverride, hasAdminLogs = false, parserEngine = "legacy" }: UploadV2Options): string {
  const params = new URLSearchParams();
  params.set("unlisted", String(unlistedLog));
  if (format) params.set("format", format);
  if (flavorOverride) params.set("flavor", flavorOverride);
  // An old component state must not leak an admin option after permission loss.
  // Omission is legacy on the server, including newly submitted attempts.
  if (hasAdminLogs && parserEngine === "parsernext") params.set("parser_engine", parserEngine);
  return `/api/v1/raidlogs/logs/upload-v2?${params.toString()}`;
}
