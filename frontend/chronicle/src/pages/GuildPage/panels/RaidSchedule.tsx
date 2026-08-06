import { CalendarClock, Plus, X } from "lucide-react";
import { normalizeSchedule, validHexColor } from "./RaidSchedule.utils";
import type { ScheduleEntry, ScheduleKind } from "./RaidSchedule.utils";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface RaidScheduleConfig {
  /** Structured entries; older saves may hold a pipe-separated string. */
  schedule: ScheduleEntry[] | string;
  note: string;
  /** Hex accent for raid nights; empty = theme primary. */
  accentColor: string;
}

// --- UTC time helpers ---

/** Today's date at the given "HH:MM" UTC; null when unset/invalid. */
function utcTimeToDate(hhmm?: string): Date | null {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const date = new Date();
  date.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

function formatLocalTime(hhmm?: string): string {
  const date = utcTimeToDate(hhmm);
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Short local timezone label ("EST", "GMT+2") for appending to times. */
function localTimeZoneLabel(): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** Stored UTC "HH:MM" -> local "HH:MM" for <input type="time">. */
function utcToLocalInput(hhmm?: string): string {
  const date = utcTimeToDate(hhmm);
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Local "HH:MM" from <input type="time"> -> UTC "HH:MM" for storage. */
function localInputToUtc(hhmm: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return undefined;
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

/** The row's displayed time and invite strings (local time, or legacy text). */
function entryTimes(entry: ScheduleEntry): { time: string; invite: string } {
  const start = formatLocalTime(entry.startUtc);
  const end = formatLocalTime(entry.endUtc);
  if (start || end) {
    const tz = localTimeZoneLabel();
    const range = start && end ? `${start}–${end}` : start || end;
    const inviteLocal = formatLocalTime(entry.inviteUtc);
    return {
      time: tz ? `${range} ${tz}` : range,
      invite: inviteLocal ? `inv ${inviteLocal}` : "",
    };
  }
  return { time: entry.time ?? "", invite: entry.invite ?? "" };
}

/** Structured editor rendered inside the panel config modal. */
function scheduleEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  // Keep empty rows while editing; they are dropped at render time.
  const entries = Array.isArray(value)
    ? (value as ScheduleEntry[])
    : normalizeSchedule(value as string | undefined);

  const update = (index: number, patch: Partial<ScheduleEntry>) => {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <div className="space-y-2.5">
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">No raid days yet. Add a day or section.</p>
      )}
      {entries.map((entry, i) => {
        const isSection = entry.kind === "section";
        const color = validHexColor(entry.color);

        return (
          <div key={i} className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5">
              {!isSection && (
                <input
                  type="text"
                  value={entry.day}
                  onChange={(e) => update(i, { day: e.target.value })}
                  placeholder="Tue"
                  className="w-14 rounded-md border border-input bg-background px-2 py-1 text-xs"
                />
              )}
              <input
                type="text"
                value={entry.raid}
                onChange={(e) => update(i, { raid: e.target.value })}
                placeholder={isSection ? "NA teams" : "Molten Core"}
                disabled={entry.kind === "off"}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
              />
              <select
                value={entry.kind}
                onChange={(e) => update(i, { kind: e.target.value as ScheduleKind })}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                title="Schedule item type"
              >
                <option value="raid">Raid night</option>
                <option value="optional">Optional</option>
                <option value="off">Off day</option>
                <option value="section">Section</option>
              </select>
              <button
                type="button"
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title={isSection ? "Remove section" : "Remove day"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {!isSection && entry.kind !== "off" && (
              <div className="grid grid-cols-3 gap-1.5">
                <label className="space-y-0.5">
                  <span className="block text-[10px] text-muted-foreground">Start</span>
                  <input
                    type="time"
                    value={utcToLocalInput(entry.startUtc)}
                    onChange={(e) =>
                      update(i, { startUtc: localInputToUtc(e.target.value), time: undefined })
                    }
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="block text-[10px] text-muted-foreground">End</span>
                  <input
                    type="time"
                    value={utcToLocalInput(entry.endUtc)}
                    onChange={(e) =>
                      update(i, { endUtc: localInputToUtc(e.target.value), time: undefined })
                    }
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="block text-[10px] text-muted-foreground">Invites</span>
                  <input
                    type="time"
                    value={utcToLocalInput(entry.inviteUtc)}
                    onChange={(e) =>
                      update(i, { inviteUtc: localInputToUtc(e.target.value), invite: undefined })
                    }
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </label>
              </div>
            )}
            {!isSection && (
              <input
                type="text"
                value={entry.note ?? ""}
                onChange={(e) => update(i, { note: e.target.value })}
                placeholder="Note (optional)"
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            )}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] text-muted-foreground">
                {isSection ? "Section color" : "Row color"}
              </span>
              <label className="relative h-6 w-6 shrink-0">
                <span
                  className={`block h-6 w-6 cursor-pointer rounded border border-input ${color ? "" : "bg-primary"}`}
                  style={color ? { backgroundColor: color } : undefined}
                />
                <input
                  type="color"
                  value={color || "#e8a33d"}
                  onChange={(e) => update(i, { color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={isSection ? "Section color" : "Row color"}
                />
              </label>
              <span className="flex-1 text-[10px] text-muted-foreground/70">
                {color ?? "Panel default"}
              </span>
              {color && (
                <button
                  type="button"
                  onClick={() => update(i, { color: undefined })}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange([...entries, { day: "", raid: "", kind: "raid" }])}
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add day
        </button>
        <button
          type="button"
          onClick={() => onChange([...entries, { day: "", raid: "", kind: "section" }])}
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add section
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Times are entered in your local time ({localTimeZoneLabel()}), stored in UTC, and shown to
        each visitor in their own timezone.
      </p>
    </div>
  );
}

/** Accent color editor: theme default or a custom hex. */
function accentColorEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const color = validHexColor(value) ?? "";
  return (
    <div className="flex items-center gap-2">
      <label className="relative shrink-0">
        <span
          className={`block h-8 w-8 cursor-pointer rounded-md border border-input ${color ? "" : "bg-primary"}`}
          style={color ? { backgroundColor: color } : undefined}
        />
        <input
          type="color"
          value={color || "#e8a33d"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <span className="flex-1 text-xs text-muted-foreground">
        {color ? color : "Theme default"}
      </span>
      {color && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          Reset to theme
        </button>
      )}
    </div>
  );
}

function raidScheduleContent({ config, isEditing }: GuildPanelRenderProps<RaidScheduleConfig>) {
  const rows = normalizeSchedule(config.schedule);
  const note = config.note || "";
  const accent = validHexColor(config.accentColor);

  if (rows.length === 0 && !note) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm text-center px-4">
          {isEditing ? "Open this panel's settings to add raid days." : "No raid schedule yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => {
          const highlighted = row.kind === "raid";
          const offDay = row.kind === "off";
          const rowAccent = validHexColor(row.color) ?? (highlighted ? accent : undefined);

          if (row.kind === "section") {
            return (
              <div
                key={`section-${row.raid}-${i}`}
                className="mt-2 flex items-center gap-2 first:mt-0"
                style={rowAccent ? { color: rowAccent } : undefined}
              >
                <span
                  className={`h-px flex-1 ${rowAccent ? "" : "bg-border/60"}`}
                  style={rowAccent ? { backgroundColor: `${rowAccent}80` } : undefined}
                />
                <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${rowAccent ? "" : "text-muted-foreground"}`}>
                  {row.raid}
                </span>
                <span
                  className={`h-px flex-1 ${rowAccent ? "" : "bg-border/60"}`}
                  style={rowAccent ? { backgroundColor: `${rowAccent}80` } : undefined}
                />
              </div>
            );
          }

          const times = entryTimes(row);
          return (
            <div
              key={`${row.day}-${i}`}
              className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-2.5 rounded-md border px-3 py-2 ${
                highlighted && !rowAccent
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/50 bg-muted/20"
              }`}
              style={
                rowAccent
                  ? { borderColor: `${rowAccent}4d`, backgroundColor: `${rowAccent}0d` }
                  : undefined
              }
            >
              <span
                className={`text-sm font-bold uppercase tracking-wide ${
                  rowAccent
                    ? ""
                    : highlighted
                      ? "text-primary"
                      : "text-muted-foreground/60"
                }`}
                style={rowAccent ? { color: rowAccent } : undefined}
              >
                {row.day}
              </span>
              <span
                className={`truncate text-sm ${
                  offDay
                    ? "text-muted-foreground/40"
                    : highlighted
                      ? "text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {offDay ? "—" : row.raid}
              </span>
              <span className="text-right">
                <span
                  className={`block text-xs tabular-nums ${
                    offDay ? "text-muted-foreground/40" : "text-muted-foreground"
                  }`}
                >
                  {offDay ? "no raid" : times.time}
                </span>
                {!offDay && times.invite && (
                  <span className="block text-[10.5px] text-muted-foreground/60">{times.invite}</span>
                )}
                {row.note && (
                  <span className="block text-[10.5px] text-muted-foreground/60">{row.note}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {note && (
        <p
          className={`text-xs leading-relaxed text-muted-foreground whitespace-pre-line ${
            rows.length > 0 ? "mt-3 border-t border-border/40 pt-3" : ""
          }`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

export const RaidSchedulePanel: GuildPanelDefinition<RaidScheduleConfig> = {
  type: "raid_schedule",
  label: "Raid Schedule",
  icon: <CalendarClock className="h-4 w-4" />,
  description: "Weekly raid days with times and invites",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 8 },
  configSchema: [
    {
      name: "schedule",
      label: "Days",
      type: "custom",
      render: (value, onChange) => scheduleEditor({ value, onChange }),
    },
    {
      name: "accentColor",
      label: "Raid night color",
      type: "custom",
      render: (value, onChange) => accentColorEditor({ value, onChange }),
    },
    {
      name: "note",
      label: "Note (invite rules, etc.)",
      type: "textarea",
      placeholder: "Invites 20 minutes before pull.",
    },
  ],
  defaultConfig: {
    schedule: [],
    note: "",
    accentColor: "",
  },
  render: (props) => raidScheduleContent(props),
};
