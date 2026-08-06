import { CalendarClock } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface RaidScheduleConfig {
  schedule: string;
  note: string;
}

interface ScheduleRow {
  day: string;
  raid: string;
  time: string;
  invite: string;
  /** Highlighted raid night. Off days ("-") and "~optional" rows are not. */
  highlighted: boolean;
  offDay: boolean;
}

/**
 * One day per line: "Day | Raid | Time | Invite". A raid of "-" (or nothing)
 * marks an off day; prefix the raid with "~" for an optional, unhighlighted
 * run (e.g. "~Optional alt run").
 */
function parseSchedule(raw: string): ScheduleRow[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [day = "", rawRaid = "", time = "", invite = ""] = line.split("|").map((p) => p.trim());
      const offDay = rawRaid === "" || rawRaid === "-" || rawRaid === "—";
      const optional = rawRaid.startsWith("~");
      const raid = optional ? rawRaid.slice(1).trim() : rawRaid;
      return {
        day,
        raid: offDay ? "—" : raid,
        time: offDay ? "no raid" : time,
        invite: offDay ? "" : invite,
        highlighted: !offDay && !optional,
        offDay,
      };
    })
    .filter((row) => row.day.length > 0);
}

function RaidScheduleContent({ config, isEditing }: GuildPanelRenderProps<RaidScheduleConfig>) {
  const rows = parseSchedule(config.schedule || "");
  const note = config.note || "";

  if (rows.length === 0 && !note) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm text-center px-4">
          {isEditing
            ? "Open this panel's settings to add raid days (one per line: “Tue | Molten Core | 8:00–11:00 | inv 7:40”)."
            : "No raid schedule yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div
            key={`${row.day}-${i}`}
            className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-2.5 rounded-md border px-3 py-2 ${
              row.highlighted
                ? "border-primary/30 bg-primary/5"
                : "border-border/50 bg-muted/20"
            }`}
          >
            <span
              className={`text-sm font-bold uppercase tracking-wide ${
                row.highlighted ? "text-primary" : "text-muted-foreground/60"
              }`}
            >
              {row.day}
            </span>
            <span
              className={`truncate text-sm ${
                row.offDay
                  ? "text-muted-foreground/40"
                  : row.highlighted
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {row.raid}
            </span>
            <span className="text-right">
              <span
                className={`block text-xs tabular-nums ${
                  row.offDay ? "text-muted-foreground/40" : "text-muted-foreground"
                }`}
              >
                {row.time}
              </span>
              {row.invite && (
                <span className="block text-[10.5px] text-muted-foreground/60">{row.invite}</span>
              )}
            </span>
          </div>
        ))}
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
      label: "Days (one per line: “Day | Raid | Time | Invite” — “-” for off days, “~” prefix for optional runs)",
      type: "textarea",
      placeholder:
        "Tue | Molten Core | 8:00–11:00 | inv 7:40\nWed | -\nThu | Blackwing Lair | 8:00–11:00 | inv 7:40\nSat | ~Optional alt run | 8:45–10:30 | inv 8:30",
    },
    {
      name: "note",
      label: "Note (invite rules, server time, etc.)",
      type: "textarea",
      placeholder: "All times server time. Invites 20 minutes before pull.",
    },
  ],
  defaultConfig: {
    schedule: "",
    note: "",
  },
  render: (props) => <RaidScheduleContent {...props} />,
};
