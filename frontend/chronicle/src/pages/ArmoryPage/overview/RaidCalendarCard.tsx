import { useMemo } from "react";
import { Link } from "react-router-dom";
import { addDays, differenceInCalendarWeeks, format, getDay, isAfter } from "date-fns";
import type { RecentInstance } from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { formatDuration } from "@/pages/Logs/utils/calendarUtils";
import { parseHexColor } from "@/pages/Instance/parseColors";
import { ACTIVITY_WEEKS, type ActivityStats } from "./util";

interface RaidCalendarCardProps {
  instances?: readonly RecentInstance[];
  /** Best parse display score per instance_id, for cell coloring. */
  nightScores: Map<string, number>;
  /** Start of the heatmap window (start of a week). */
  start: Date;
  stats: ActivityStats;
  onOpenActivity: () => void;
}

interface DayCell {
  date: Date;
  raids: RecentInstance[];
  bestScore?: number;
}

/** GitHub-style heatmap of the last 12 weeks of raid nights. */
export function RaidCalendarCard({ instances, nightScores, start, stats, onOpenActivity }: RaidCalendarCardProps) {
  const weeks = useMemo(() => {
    const cells = new Map<string, DayCell>();
    const now = new Date();
    for (let d = new Date(start); !isAfter(d, now); d = addDays(d, 1)) {
      cells.set(format(d, "yyyy-MM-dd"), { date: new Date(d), raids: [] });
    }

    for (const inst of instances ?? []) {
      const date = new Date(inst.first_encounter_time);
      const cell = cells.get(format(date, "yyyy-MM-dd"));
      if (!cell) continue;
      cell.raids.push(inst);
      const score = nightScores.get(inst.id);
      if (score !== undefined && score > (cell.bestScore ?? -1)) {
        cell.bestScore = score;
      }
    }

    const weeks: DayCell[][] = Array.from({ length: ACTIVITY_WEEKS }, () => []);
    for (const cell of cells.values()) {
      const w = differenceInCalendarWeeks(cell.date, start);
      if (w >= 0 && w < ACTIVITY_WEEKS) {
        weeks[w][getDay(cell.date)] = cell;
      }
    }
    return weeks;
  }, [instances, nightScores, start]);

  return (
    <Card className="gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Raid calendar</CardTitle>
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
                if (!cell || cell.raids.length === 0) {
                  return (
                    <div
                      key={d}
                      className="size-4 rounded-xs bg-border"
                      style={{ opacity: cell ? 1 : 0.3 }}
                    />
                  );
                }
                return (
                  <RaidedCell
                    key={d}
                    cell={cell}
                    nightScores={nightScores}
                    onOpenActivity={onOpenActivity}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-8 border-t border-border pt-4">
          <CalendarStat value={String(stats.nights)} label="raid nights" />
          <CalendarStat value={formatDuration(stats.totalMs) || "0m"} label="in raid" />
          <CalendarStat
            value={String(stats.weekStreak)}
            label={stats.weekStreak === 1 ? "week streak" : "weeks streak"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A raid-night cell: hover shows the night's raids and best parse; click
 * opens the log (single raid) or the full calendar (multiple raids).
 */
function RaidedCell({
  cell,
  nightScores,
  onOpenActivity,
}: {
  cell: DayCell;
  nightScores: Map<string, number>;
  onOpenActivity: () => void;
}) {
  const single = cell.raids.length === 1 ? cell.raids[0] : undefined;
  const cellClass =
    "block size-4 cursor-pointer rounded-xs transition-transform hover:scale-125 hover:ring-1 hover:ring-foreground/60";
  const cellStyle = {
    background:
      cell.bestScore !== undefined
        ? parseHexColor(cell.bestScore)
        : "var(--color-green-400)",
  };

  const content = (
    <TooltipContent className="pointer-events-none" sideOffset={4}>
      <div className="mb-1 font-semibold">{format(cell.date, "EEE, MMM d")}</div>
      {cell.raids.map((r) => {
        const score = nightScores.get(r.id);
        const duration = formatDuration(r.duration_ms);
        return (
          <div key={r.id} className="flex items-baseline justify-between gap-4">
            <span>
              {r.name} · {r.boss_kills}/{r.boss_count}
              {duration ? ` · ${duration}` : ""}
            </span>
            {score !== undefined && <span className="font-mono font-bold">{score}</span>}
          </div>
        );
      })}
      <div className="mt-1 opacity-70">
        {single ? "Click to open the log" : "Click for the full calendar"}
      </div>
    </TooltipContent>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {single ? (
          <Link
            to={single.slug ? `/instances/${single.slug}` : `/instances/${single.id}`}
            className={cellClass}
            style={cellStyle}
            aria-label={`${single.name} on ${format(cell.date, "MMM d")}`}
          />
        ) : (
          <button
            onClick={onOpenActivity}
            className={cellClass}
            style={cellStyle}
            aria-label={`${cell.raids.length} raids on ${format(cell.date, "MMM d")}`}
          />
        )}
      </TooltipTrigger>
      {content}
    </Tooltip>
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
