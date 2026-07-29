/* eslint-disable react-refresh/only-export-components -- Panel registry files export a definition alongside their render components. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { AlertCircle, CalendarRange, Clock3, Copy, ExternalLink } from "lucide-react";
import type { RecentInstance, RecentInstancesResponse } from "@/api/typesGenerated";
import { DuplicateInstanceModal } from "@/components/DuplicateInstanceModal";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { getInstanceCategory } from "@/pages/Logs/utils/instanceImages";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import { formatClearDuration } from "./clearTimeUtils";
import {
  buildCompactCalendar,
  calculateCalendarCellSize,
  calculateWeekStreak,
  formatRaidHours,
  totalCalendarDuration,
  type CompactCalendarDay,
} from "./compactCalendarUtils";

type WeekCount = "13" | "20" | "26";
type CategoryFilter = "raid" | "all";

interface CompactCalendarConfig {
  weeks: WeekCount;
  category: CategoryFilter;
  showStats: boolean;
}

function normalizeConfig(config: CompactCalendarConfig): CompactCalendarConfig {
  return {
    weeks: ["13", "20", "26"].includes(config.weeks) ? config.weeks : "13",
    category: config.category === "all" ? "all" : "raid",
    showStats: config.showStats !== false,
  };
}

function activityClass(day: CompactCalendarDay): string {
  if (day.isFuture) return "border-border/30 bg-muted/10 opacity-40";
  if (day.instances.length === 0) return "border-border/50 bg-muted/20";

  const hours = day.durationMs / 3_600_000;
  if (hours >= 6) return "border-emerald-400/80 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.18)]";
  if (hours >= 4) return "border-emerald-500/70 bg-emerald-600";
  if (hours >= 2) return "border-emerald-600/60 bg-emerald-700";
  if (hours >= 1) return "border-emerald-700/50 bg-emerald-800";
  return "border-emerald-800/50 bg-emerald-950";
}

function dayTitle(day: CompactCalendarDay): string {
  const date = format(day.date, "EEEE, MMMM d");
  if (day.isFuture) return date;
  if (day.instances.length === 0) return `${date}: no raid activity`;

  const raidCount = day.instances.length;
  const duration = formatRaidHours(day.durationMs);
  return `${date}: ${raidCount} ${raidCount === 1 ? "run" : "runs"}, ${duration} in raid`;
}

function RunResult({
  group,
  onOpenDuplicates,
}: {
  group: RecentInstance[];
  onOpenDuplicates: (group: RecentInstance[]) => void;
}) {
  const instance = group[0];
  const isDuplicate = group.length > 1;
  const duration = instance.duration_ms ? formatClearDuration(instance.duration_ms) : null;
  const instanceUrl = instance.slug
    ? `/instances/${instance.slug}`
    : `/instances/${instance.id}`;

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <span className="truncate text-xs font-medium text-card-foreground">
            {instance.name}
          </span>
          {instance.boss_count > 0 && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {instance.boss_kills}/{instance.boss_count}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          {isDuplicate ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenDuplicates(group);
              }}
            >
              <Copy className="h-2.5 w-2.5" />
              Choose from {group.length} logs
            </button>
          ) : (
            <Link
              to={instanceUrl}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              View log
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          )}
          {duration && (
            <span className="ml-auto flex shrink-0 items-center gap-1 font-mono tabular-nums">
              <Clock3 className="h-2.5 w-2.5" />
              {duration}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DayTooltip({
  day,
  onOpenDuplicates,
}: {
  day: CompactCalendarDay;
  onOpenDuplicates: (group: RecentInstance[]) => void;
}) {
  const dateLabel = format(day.date, "EEEE, MMMM d");

  return (
    <div className="w-72">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Raid activity
          </div>
          <div className="mt-0.5 text-sm font-semibold text-card-foreground">
            {dateLabel}
          </div>
        </div>
      </div>

      {day.instances.length > 0 ? (
        <>
          <div className="max-h-64 divide-y divide-border/60 overflow-y-auto pr-1 styled-scrollbar">
            {day.instanceGroups.map((group) => (
              <RunResult
                key={group[0].id}
                group={group}
                onOpenDuplicates={onOpenDuplicates}
              />
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
            <span>
              {day.instances.length} {day.instances.length === 1 ? "run" : "runs"}
            </span>
            <span className="font-mono tabular-nums">
              {formatRaidHours(day.durationMs)} total
            </span>
          </div>
        </>
      ) : (
        <div className="py-3 text-xs text-muted-foreground">
          {day.isFuture ? "No activity yet" : "No raid activity recorded"}
        </div>
      )}
    </div>
  );
}

const CALENDAR_GAP = 4;

function ActivityGrid({ weeks }: { weeks: ReturnType<typeof buildCompactCalendar> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);
  const [duplicatePickerGroup, setDuplicatePickerGroup] = useState<RecentInstance[] | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCellSize = () => {
      setCellSize(
        calculateCalendarCellSize(
          container.clientWidth,
          container.clientHeight,
          weeks.length,
          CALENDAR_GAP,
        ),
      );
    };
    const observer = new ResizeObserver(updateCellSize);
    observer.observe(container);
    updateCellSize();
    return () => observer.disconnect();
  }, [weeks.length]);

  return (
    <>
      <div
        ref={containerRef}
        className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-visible"
        role="img"
        aria-label={`${weeks.length} week raid activity calendar. Brighter green indicates more time spent raiding.`}
      >
        <div className="flex" style={{ gap: CALENDAR_GAP }}>
          {weeks.map((week) => (
            <div
              key={week.weekKey}
              className="flex flex-col"
              style={{ gap: CALENDAR_GAP, width: cellSize }}
            >
              {week.days.map((day) => (
                <HintTooltip key={day.dateKey} delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={dayTitle(day)}
                      style={{ width: cellSize, height: cellSize }}
                      className={`shrink-0 rounded-[3px] border transition-transform duration-150 hover:z-[1] hover:scale-110 focus-visible:z-[1] focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activityClass(day)}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    hideArrow
                    className="border border-border bg-card p-3 text-card-foreground shadow-xl"
                  >
                    <DayTooltip
                      day={day}
                      onOpenDuplicates={setDuplicatePickerGroup}
                    />
                  </TooltipContent>
                </HintTooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
      {duplicatePickerGroup &&
        createPortal(
          <DuplicateInstanceModal
            instances={duplicatePickerGroup}
            onClose={() => setDuplicatePickerGroup(null)}
          />,
          document.body,
        )}
    </>
  );
}

function CompactCalendarContent({
  config: rawConfig,
  guild,
}: GuildPanelRenderProps<CompactCalendarConfig>) {
  const config = normalizeConfig(rawConfig);
  const weekCount = Number(config.weeks);
  const [instances, setInstances] = useState<RecentInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchActivity = async () => {
      setLoading(true);
      setError(null);

      try {
        const now = new Date();
        const currentWeek = startOfWeek(now, { weekStartsOn: 1 });
        const rangeStart = subWeeks(currentWeek, weekCount - 1);
        const rangeEnd = addWeeks(currentWeek, 1);
        const params = new URLSearchParams({
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
          guild_id: guild.id,
        });

        const response = await fetch(`/api/v1/raidlogs/range?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Failed to fetch raid activity");

        const data = (await response.json()) as RecentInstancesResponse;
        setInstances([...(data.instances ?? [])]);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchActivity();
    return () => controller.abort();
  }, [guild.id, weekCount]);

  const filteredInstances = useMemo(
    () =>
      config.category === "all"
        ? instances
        : instances.filter((instance) => getInstanceCategory(instance.name) === "raid"),
    [config.category, instances],
  );
  const weeks = useMemo(
    () => buildCompactCalendar(filteredInstances, weekCount),
    [filteredInstances, weekCount],
  );
  const streak = useMemo(() => calculateWeekStreak(weeks), [weeks]);
  const raidHours = useMemo(
    () => formatRaidHours(totalCalendarDuration(weeks)),
    [weeks],
  );

  if (loading) {
    return (
      <div className="flex h-full min-h-32 items-center gap-6">
        <div className="grid min-w-0 flex-1 grid-cols-13 gap-1 opacity-60">
          {Array.from({ length: 91 }, (_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-[3px] bg-muted/50" />
          ))}
        </div>
        <div className="h-24 w-px bg-border/60" />
        <div className="w-20 space-y-5">
          <div className="h-8 animate-pulse rounded bg-muted/50" />
          <div className="h-8 animate-pulse rounded bg-muted/50" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
        <p className="text-xs">Failed to load raid activity</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 px-1 py-0.5">
      <div className="flex min-h-0 flex-1 items-stretch gap-5">
        <ActivityGrid weeks={weeks} />

        {config.showStats && (
          <div className="flex shrink-0 flex-col justify-center gap-4 border-l border-border/60 pl-5 pr-2">
            <div>
              <div className="font-mono text-2xl font-bold leading-none tabular-nums text-foreground">
                {streak}
              </div>
              <div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
                week streak
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl font-bold leading-none tabular-nums text-foreground">
                {raidHours}
              </div>
              <div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
                in raid
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const CompactCalendarPanel: GuildPanelDefinition<CompactCalendarConfig> = {
  type: "compact_calendar",
  label: "Compact Calendar",
  icon: <CalendarRange className="h-4 w-4" />,
  description: "A compact activity heatmap with clear score, raid hours, and weekly streak",
  defaultSize: { w: 6, h: 2 },
  configSchema: [
    {
      name: "weeks",
      label: "Weeks shown",
      type: "select",
      options: [
        { value: "13", label: "13 weeks" },
        { value: "20", label: "20 weeks" },
        { value: "26", label: "26 weeks" },
      ],
      defaultValue: "13",
    },
    {
      name: "category",
      label: "Activity",
      type: "select",
      options: [
        { value: "raid", label: "Raids only" },
        { value: "all", label: "Raids and dungeons" },
      ],
      defaultValue: "raid",
    },
    {
      name: "showStats",
      label: "Show streak and raid hours",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    weeks: "13",
    category: "raid",
    showStats: true,
  },
  render: (props) => <CompactCalendarContent {...props} />,
};
