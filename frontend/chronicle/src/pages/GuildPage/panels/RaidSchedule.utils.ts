export type ScheduleKind = "raid" | "optional" | "off" | "section";

export interface ScheduleEntry {
  day: string;
  raid: string;
  /** "raid" nights are highlighted, "optional" runs are muted, "off" days show as no raid. */
  kind: ScheduleKind;
  /** Optional per-row accent. Overrides the panel accent color. */
  color?: string;
  /** Times as "HH:MM" in UTC; rendered in the viewer's local time. */
  startUtc?: string;
  endUtc?: string;
  inviteUtc?: string;
  /** Optional note shown under the time/invite lines. */
  note?: string;
  /** Legacy freeform strings from older saves. */
  time?: string;
  invite?: string;
}

export function validHexColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

/** Accepts the structured array, or the legacy "Day | Raid | Time | Invite" lines. */
export function normalizeSchedule(raw: ScheduleEntry[] | string | undefined): ScheduleEntry[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => ({
        day: entry?.day ?? "",
        raid: entry?.raid ?? "",
        kind: (["raid", "optional", "off", "section"].includes(entry?.kind)
          ? entry.kind
          : "raid") as ScheduleKind,
        color: validHexColor(entry?.color),
        startUtc: entry?.startUtc,
        endUtc: entry?.endUtc,
        inviteUtc: entry?.inviteUtc,
        note: entry?.note,
        time: entry?.time,
        invite: entry?.invite,
      }))
      .filter((entry) =>
        entry.kind === "section" ? entry.raid.trim().length > 0 : entry.day.trim().length > 0,
      );
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
