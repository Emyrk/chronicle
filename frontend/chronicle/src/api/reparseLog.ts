import type { ParserEngine } from "./typesGenerated";

export interface ReparseLogGroupOptions {
  logId: string;
  /** Explicit admin-only engine selection; omission retains legacy default. */
  parserEngine?: ParserEngine;
  /** Enable debug mode annotations in parsed output */
  withDebug?: boolean;
  /** Enable identity mode to collect all creatures/spells (admin only) */
  identityMode?: boolean;
  /** Capture a parse-only CPU profile (admin only) */
  profile?: boolean;
  /** Override the log type before reparsing (admin only) */
  logType?: string;
  /** Override the parse format before reparsing (admin only) */
  format?: string;
  /** Override the server flavor (comma-joined tags) before reparsing (admin only) */
  flavor?: string;
}


export function reparseLogURL({ logId, withDebug = false, identityMode = false, profile = false, logType, format, flavor, parserEngine }: ReparseLogGroupOptions, origin: string): string {
  const url = new URL(`/api/v1/raidlogs/logs/${logId}/reparse`, origin);
  if (withDebug) {
    url.searchParams.set("verbose", "true");
  }
  if (identityMode) {
    url.searchParams.set("identity_mode", "true");
  }
  if (profile) {
    url.searchParams.set("profile", "true");
  }
  if (logType) {
    url.searchParams.set("log_type", logType);
  }
  if (format) {
    url.searchParams.set("format", format);
  }
  if (flavor) {
    url.searchParams.set("flavor", flavor);
  }
  if (parserEngine) url.searchParams.set("parser_engine", parserEngine);
  return url.toString();
}
