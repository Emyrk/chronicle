import type { WoWLogGroup, WoWParsedLogJobOutput } from "@/api/queries";
import type { WoWSimpleParsedInstance } from "@/api/typesGenerated";

export type LogStatus =
  | "processing"
  | "parse_failed"
  | "parsed_with_warnings"
  | "parsed_complete"
  | "raw_deleted"
  | "partially_deleted";

export interface LogStatusInfo {
  status: LogStatus;
  label: string;
  badgeClassName: string;
}

const STATUS_META: Record<LogStatus, Omit<LogStatusInfo, "status">> = {
  processing: { label: "Processing", badgeClassName: "bg-muted text-muted-foreground" },
  parse_failed: { label: "Parse failed", badgeClassName: "bg-destructive/15 text-destructive" },
  parsed_with_warnings: { label: "Parsed · warnings", badgeClassName: "bg-accent text-accent-foreground" },
  parsed_complete: { label: "Parsed", badgeClassName: "bg-primary/15 text-primary" },
  raw_deleted: { label: "Raw deleted", badgeClassName: "bg-muted text-muted-foreground" },
  partially_deleted: { label: "Partially deleted", badgeClassName: "bg-accent text-accent-foreground" },
};

/**
 * Parses a log group's processing_output into a WoWParsedLogJobOutput, or
 * null if the group hasn't produced any parse output yet. The generated SDK
 * type for processing_output is loose (Record<string, string>) because it's
 * transported as raw JSON on the Go side — this narrows it the same way
 * pages/Logs/utils/calendarUtils.ts's parseParsedOutput does.
 */
export function parseProcessingOutput(output: WoWLogGroup["processing_output"]): WoWParsedLogJobOutput | null {
  if (!output || typeof output !== "object") return null;
  const parsed = output as unknown as WoWParsedLogJobOutput;
  if (!Array.isArray(parsed.instances)) return null;
  return parsed;
}

/** Parsed instances for a log group, or an empty array if none exist yet. */
export function getParsedInstances(group: WoWLogGroup): readonly WoWSimpleParsedInstance[] {
  return parseProcessingOutput(group.processing_output)?.instances ?? [];
}

export interface RawFileCounts {
  activeCount: number;
  deletedCount: number;
  rawState: "none" | "all_active" | "all_deleted" | "partial";
}

export function getRawFileCounts(group: WoWLogGroup): RawFileCounts {
  const files = group.files ?? [];
  const activeCount = files.filter((f) => !f.storage_deleted_at).length;
  const deletedCount = files.length - activeCount;
  const rawState: RawFileCounts["rawState"] =
    files.length === 0 ? "none" : deletedCount === 0 ? "all_active" : activeCount === 0 ? "all_deleted" : "partial";
  return { activeCount, deletedCount, rawState };
}

/**
 * Derives a single display status for a log group from its raw-file state
 * and parse output.
 *
 * Known approximation: a group with no processing_output at all is reported
 * as "processing" — there's no separate job-status field visible to the
 * frontend today, so this can't distinguish "queued/running" from "a parse
 * job that never started".
 *
 * Precedence: once parsing has produced a result (with or without
 * per-instance warnings), the raw-file lifecycle takes over the displayed
 * status — raw files matter most exactly when parsing hasn't succeeded
 * cleanly, so "processing"/"parse_failed" always win over raw state, but
 * "raw_deleted"/"partially_deleted" win over "parsed_complete"/
 * "parsed_with_warnings". Callers that need both facts (e.g. a "parsed with
 * warnings, and raw files are gone" note) should read getRawFileCounts and
 * parseProcessingOutput directly rather than relying on the single status.
 */
export function deriveLogStatus(group: WoWLogGroup): LogStatusInfo {
  const { rawState } = getRawFileCounts(group);
  const output = parseProcessingOutput(group.processing_output);
  const hasFailures = !!output && Object.keys(output.instance_failures ?? {}).length > 0;
  const hasInstances = !!output && output.instances.length > 0;

  let parseStatus: "processing" | "parse_failed" | "parsed_with_warnings" | "parsed_complete";
  if (!output) {
    parseStatus = "processing";
  } else if (hasFailures && !hasInstances) {
    parseStatus = "parse_failed";
  } else if (hasFailures) {
    parseStatus = "parsed_with_warnings";
  } else {
    parseStatus = "parsed_complete";
  }

  let status: LogStatus;
  if (parseStatus === "processing" || parseStatus === "parse_failed") {
    status = parseStatus;
  } else if (rawState === "all_deleted") {
    status = "raw_deleted";
  } else if (rawState === "partial") {
    status = "partially_deleted";
  } else {
    status = parseStatus;
  }

  return { status, ...STATUS_META[status] };
}
