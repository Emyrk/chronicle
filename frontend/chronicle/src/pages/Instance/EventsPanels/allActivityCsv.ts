import type { RawDebugEvent } from "./processors";
import { STREAM_TYPE_CODES, eventDetail, eventValue } from "./allActivityEvents";

export interface AllActivityCsvOptions {
  useRelativeTime: boolean;
  useLocalTime: boolean;
}

export interface AllActivityCsvExportState {
  page: number;
  totalPages: number;
  events: RawDebugEvent[];
}

function formatTimestamp(absoluteMilli: number, useLocalTime: boolean): string {
  const eventTime = new Date(absoluteMilli);
  if (useLocalTime) {
    const milliseconds = eventTime.getMilliseconds().toString().padStart(3, "0");
    return eventTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) + `.${milliseconds}`;
  }

  const hours = eventTime.getUTCHours().toString().padStart(2, "0");
  const minutes = eventTime.getUTCMinutes().toString().padStart(2, "0");
  const seconds = eventTime.getUTCSeconds().toString().padStart(2, "0");
  const milliseconds = eventTime.getUTCMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function formatRelativeTime(offsetMilli: number): string {
  const sign = offsetMilli >= 0 ? "+" : "-";
  const totalTenths = Math.round(Math.abs(offsetMilli) / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = (totalTenths % 600) / 10;
  return `${sign}${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function sortAllActivityEvents(events: RawDebugEvent[]): RawDebugEvent[] {
  return [...events].sort((a, b) => {
    if (a.encounterID !== b.encounterID) {
      return a.encounterID.localeCompare(b.encounterID);
    }
    return a.index - b.index;
  });
}

export function appendAllActivityCsvPage<T extends AllActivityCsvExportState>(
  state: T,
  pageEvents: RawDebugEvent[],
): T {
  return {
    ...state,
    page: Math.min(state.page + 1, state.totalPages),
    events: [...state.events, ...sortAllActivityEvents(pageEvents)],
  };
}

export function createAllActivityCsv(
  events: RawDebugEvent[],
  options: AllActivityCsvOptions,
): string {
  const headers = [
    "#",
    "Type",
    "Time",
    "Source",
    "Source GUID",
    "Action / Ability",
    "Spell ID",
    "Target",
    "Target GUID",
    "Value",
    "Outcome / Detail",
    "Flags",
    "Activity",
    "Encounter",
    "Event Index",
    "Offset (ms)",
    "Synthetic",
  ];

  const rows = events.map((event, index) => {
    const time = options.useRelativeTime
      ? formatRelativeTime(event.offsetMilli)
      : formatTimestamp(event.dateMilli, options.useLocalTime);
    const activity = event.activityEvents
      ?.map((entry) => `${entry.type}: ${entry.name} (${entry.guid})`)
      .join(" | ") ?? "";

    return [
      index,
      STREAM_TYPE_CODES[event.streamType],
      time,
      event.casterName || "",
      event.caster || "",
      event.sourceName || "",
      event.spellId ?? "",
      event.targetName || "",
      event.target || "",
      eventValue(event),
      eventDetail(event),
      event.flags?.join(" | ") ?? "",
      activity,
      event.encounterID,
      event.index,
      event.offsetMilli,
      event.isSynthetic,
    ].map(csvCell).join(",");
  });

  return [headers.map(csvCell).join(","), ...rows].join("\n");
}

export function downloadAllActivityCsv(csv: string, instanceId: string): void {
  const safeInstanceId = instanceId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `all-activity-${safeInstanceId || "export"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
