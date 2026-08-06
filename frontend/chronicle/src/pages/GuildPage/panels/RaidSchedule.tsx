import { CalendarClock, Plus, X } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

type ScheduleKind = "raid" | "optional" | "off";

interface ScheduleEntry {
  day: string;
  raid: string;
  time: string;
  invite: string;
  /** "raid" nights are highlighted, "optional" runs are muted, "off" days show as no raid. */
  kind: ScheduleKind;
}

interface RaidScheduleConfig {
  /** Structured entries; older saves may hold a pipe-separated string. */
  schedule: ScheduleEntry[] | string;
  note: string;
}

/** Accepts the structured array, or the legacy "Day | Raid | Time | Invite" lines. */
function normalizeSchedule(raw: ScheduleEntry[] | string | undefined): ScheduleEntry[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => ({
        day: entry?.day ?? "",
        raid: entry?.raid ?? "",
        time: entry?.time ?? "",
        invite: entry?.invite ?? "",
        kind: (["raid", "optional", "off"].includes(entry?.kind) ? entry.kind : "raid") as ScheduleKind,
      }))
      .filter((entry) => entry.day.length > 0);
  }
  if (typeof raw !== "string") return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [day = "", rawRaid = "", time = "", invite = ""] = line.split("|").map((p) => p.trim());
      const offDay = rawRaid === "" || rawRaid === "-" || rawRaid === "—";
      const optional = rawRaid.startsWith("~");
      return {
        day,
        raid: offDay ? "" : optional ? rawRaid.slice(1).trim() : rawRaid,
        time: offDay ? "" : time,
        invite: offDay ? "" : invite,
        kind: (offDay ? "off" : optional ? "optional" : "raid") as ScheduleKind,
      };
    })
    .filter((entry) => entry.day.length > 0);
}

/** Structured editor rendered inside the panel config modal. */
function ScheduleEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
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
        <p className="text-xs text-muted-foreground">No raid days yet — add your first one.</p>
      )}
      {entries.map((entry, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={entry.day}
              onChange={(e) => update(i, { day: e.target.value })}
              placeholder="Tue"
              className="w-14 rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
            <input
              type="text"
              value={entry.raid}
              onChange={(e) => update(i, { raid: e.target.value })}
              placeholder="Molten Core"
              disabled={entry.kind === "off"}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
            />
            <select
              value={entry.kind}
              onChange={(e) => update(i, { kind: e.target.value as ScheduleKind })}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              title="Kind of day"
            >
              <option value="raid">Raid night</option>
              <option value="optional">Optional</option>
              <option value="off">Off day</option>
            </select>
            <button
              type="button"
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Remove day"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {entry.kind !== "off" && (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                value={entry.time}
                onChange={(e) => update(i, { time: e.target.value })}
                placeholder="Time (8:00–11:00)"
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={entry.invite}
                onChange={(e) => update(i, { invite: e.target.value })}
                placeholder="Invites (inv 7:40)"
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...entries, { day: "", raid: "", time: "", invite: "", kind: "raid" }])}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add day
      </button>
    </div>
  );
}

function RaidScheduleContent({ config, isEditing }: GuildPanelRenderProps<RaidScheduleConfig>) {
  const rows = normalizeSchedule(config.schedule);
  const note = config.note || "";

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
          return (
            <div
              key={`${row.day}-${i}`}
              className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-2.5 rounded-md border px-3 py-2 ${
                highlighted ? "border-primary/30 bg-primary/5" : "border-border/50 bg-muted/20"
              }`}
            >
              <span
                className={`text-sm font-bold uppercase tracking-wide ${
                  highlighted ? "text-primary" : "text-muted-foreground/60"
                }`}
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
                  {offDay ? "no raid" : row.time}
                </span>
                {!offDay && row.invite && (
                  <span className="block text-[10.5px] text-muted-foreground/60">{row.invite}</span>
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
      render: (value, onChange) => <ScheduleEditor value={value} onChange={onChange} />,
    },
    {
      name: "note",
      label: "Note (invite rules, server time, etc.)",
      type: "textarea",
      placeholder: "All times server time. Invites 20 minutes before pull.",
    },
  ],
  defaultConfig: {
    schedule: [],
    note: "",
  },
  render: (props) => <RaidScheduleContent {...props} />,
};
