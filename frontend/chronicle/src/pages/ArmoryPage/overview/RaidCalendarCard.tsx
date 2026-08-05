import { useMemo } from "react";
import { addDays, differenceInCalendarWeeks, format, getDay, isAfter } from "date-fns";
import type { RecentInstance } from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { formatDuration } from "@/pages/Logs/utils/calendarUtils";
import { parseHexColor } from "@/pages/Instance/parseColors";
import { ACTIVITY_WEEKS } from "./util";

interface RaidCalendarCardProps {
  instances?: readonly RecentInstance[];
  /** Best parse display score per instance_id, for cell coloring. */
  nightScores: Map<string, number>;
  /** Start of the heatmap window (start of a week). */
  start: Date;
  onOpenActivity: () => void;
}

interface DayCell {
  date: Date;
  raids: RecentInstance[];
  bestScore?: number;
}

/** GitHub-style heatmap of the last 12 weeks of raid nights. */
export function RaidCalendarCard({ instances, nightScores, start, onOpenActivity }: RaidCalendarCardProps) {
  const { weeks, nights, totalMs, weekStreak } = useMemo(() => {
    const cells = new Map<string, DayCell>();
    const now = new Date();
    for (let d = new Date(start); !isAfter(d, now); d = addDays(d, 1)) {
      cells.set(format(d, "yyyy-MM-dd"), { date: new Date(d), raids: [] });
    }

    let totalMs = 0;
    const raidWeeks = new Set<number>();
    for (const inst of instances ?? []) {
      const date = new Date(inst.first_encounter_time);
      const cell = cells.get(format(date, "yyyy-MM-dd"));
      if (!cell) continue;
      cell.raids.push(inst);
      totalMs += inst.duration_ms ?? 0;
      raidWeeks.add(differenceInCalendarWeeks(date, start));
      const score = nightScores.get(inst.id);
      if (score !== undefined && score > (cell.bestScore ?? -1)) {
        cell.bestScore = score;
      }
    }

    // Consecutive raiding weeks, counting back from the latest raiding week.
    let weekStreak = 0;
    for (let w = ACTIVITY_WEEKS - 1; w >= 0; w--) {
      if (raidWeeks.has(w)) {
        weekStreak++;
      } else if (weekStreak > 0 || w < ACTIVITY_WEEKS - 1) {
        // The current (possibly partial) week may be empty without breaking.
        break;
      }
    }

    const weeks: DayCell[][] = Array.from({ length: ACTIVITY_WEEKS }, () => []);
    for (const cell of cells.values()) {
      const w = differenceInCalendarWeeks(cell.date, start);
      if (w >= 0 && w < ACTIVITY_WEEKS) {
        weeks[w][getDay(cell.date)] = cell;
      }
    }

    const nights = [...cells.values()].filter((c) => c.raids.length > 0).length;
    return { weeks, nights, totalMs, weekStreak };
  }, [instances, nightScores, start]);

  return (
    <Card className="gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Raid nights</CardTitle>
        <CardDescription>Last {ACTIVITY_WEEKS} weeks</CardDescription>
        <CardAction>
          <button
            onClick={onOpenActivity}
            className="cursor-pointer text-xs text-link hover:underline"
          >
            Full calendar →
          </button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1 overflow-x-auto">
          {weeks.map((week, w) => (
            <div key={w} className="flex flex-col gap-1">
              {Array.from({ length: 7 }, (_, d) => {
                const cell = week[d];
                const raided = cell && cell.raids.length > 0;
                return (
                  <div
                    key={d}
                    title={
                      raided
                        ? `${format(cell.date, "MMM d")} · ${cell.raids.map((r) => r.name).join(", ")}${cell.bestScore !== undefined ? ` · best ${cell.bestScore}` : ""}`
                        : undefined
                    }
                    className="size-[13px] rounded-xs"
                    style={{
                      background: raided
                        ? cell.bestScore !== undefined
                          ? parseHexColor(cell.bestScore)
                          : "var(--color-green-400)"
                        : "var(--border)",
                      opacity: cell ? 1 : 0.3,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-8 border-t border-border pt-4">
          <CalendarStat value={String(nights)} label="raid nights" />
          <CalendarStat value={formatDuration(totalMs) ?? "0m"} label="in raid" />
          <CalendarStat
            value={String(weekStreak)}
            label={weekStreak === 1 ? "week streak" : "weeks streak"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
