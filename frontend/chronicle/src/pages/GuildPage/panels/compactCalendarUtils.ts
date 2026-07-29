import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import type { RecentInstance } from "@/api/typesGenerated";
import { groupDuplicateInstances } from "@/utils/groupDuplicates";

const DATE_KEY_FORMAT = "yyyy-MM-dd";
const WEEK_STARTS_ON = 1 as const;

export interface CompactCalendarDay {
  date: Date;
  dateKey: string;
  instances: RecentInstance[];
  instanceGroups: RecentInstance[][];
  score: number | null;
  durationMs: number;
  isFuture: boolean;
}

export interface CompactCalendarWeek {
  weekKey: string;
  days: CompactCalendarDay[];
}

function instanceDate(instance: RecentInstance): Date | null {
  const value = instance.first_encounter_time || instance.uploaded_at;
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function deduplicateInstances(instances: RecentInstance[]): RecentInstance[] {
  return groupDuplicateInstances(instances).map((group) => group[0]);
}

export function calculateNightScore(instances: RecentInstance[]): number | null {
  if (instances.length === 0) return null;

  let bossCount = 0;
  let bossKills = 0;
  for (const instance of instances) {
    if (instance.boss_count <= 0) continue;
    bossCount += instance.boss_count;
    bossKills += Math.min(instance.boss_kills, instance.boss_count);
  }

  if (bossCount === 0) return 0;
  return Math.max(0, Math.min(1, bossKills / bossCount));
}

export function buildCompactCalendar(
  instances: RecentInstance[],
  weekCount: number,
  now = new Date(),
): CompactCalendarWeek[] {
  const safeWeekCount = Math.max(1, Math.floor(weekCount));
  const currentWeekStart = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
  const firstWeekStart = subWeeks(currentWeekStart, safeWeekCount - 1);
  const instanceGroupsByDay = new Map<string, RecentInstance[][]>();

  for (const group of groupDuplicateInstances(instances)) {
    const representative = group[0];
    const date = instanceDate(representative);
    if (!date) continue;

    const dateKey = format(date, DATE_KEY_FORMAT);
    const dayGroups = instanceGroupsByDay.get(dateKey) ?? [];
    dayGroups.push(group);
    instanceGroupsByDay.set(dateKey, dayGroups);
  }

  return Array.from({ length: safeWeekCount }, (_, weekIndex) => {
    const weekStart = addWeeks(firstWeekStart, weekIndex);
    return {
      weekKey: format(weekStart, DATE_KEY_FORMAT),
      days: Array.from({ length: 7 }, (_, dayIndex) => {
        const date = addDays(weekStart, dayIndex);
        const dateKey = format(date, DATE_KEY_FORMAT);
        const instanceGroups = instanceGroupsByDay.get(dateKey) ?? [];
        const dayInstances = instanceGroups.map((group) => group[0]);

        return {
          date,
          dateKey,
          instances: dayInstances,
          instanceGroups,
          score: calculateNightScore(dayInstances),
          durationMs: dayInstances.reduce(
            (total, instance) => total + (instance.duration_ms ?? 0),
            0,
          ),
          isFuture: date.getTime() > now.getTime(),
        };
      }),
    };
  });
}

export function calculateWeekStreak(weeks: CompactCalendarWeek[]): number {
  if (weeks.length === 0) return 0;

  const hasActivity = (week: CompactCalendarWeek) =>
    week.days.some((day) => day.instances.length > 0);

  let weekIndex = weeks.length - 1;
  if (!hasActivity(weeks[weekIndex])) weekIndex -= 1;

  let streak = 0;
  for (; weekIndex >= 0 && hasActivity(weeks[weekIndex]); weekIndex -= 1) {
    streak += 1;
  }
  return streak;
}

export function totalCalendarDuration(weeks: CompactCalendarWeek[]): number {
  return weeks.reduce(
    (total, week) =>
      total + week.days.reduce((weekTotal, day) => weekTotal + day.durationMs, 0),
    0,
  );
}

export function calculateCalendarCellSize(
  width: number,
  height: number,
  weekCount: number,
  gap: number,
): number {
  if (width <= 0 || height <= 0 || weekCount <= 0) return 0;

  const widthAvailableForCells = width - gap * (weekCount - 1);
  const heightAvailableForCells = height - gap * 6;
  return Math.max(
    0,
    Math.min(widthAvailableForCells / weekCount, heightAvailableForCells / 7),
  );
}

export function formatRaidHours(durationMs: number): string {
  const hours = durationMs / 3_600_000;
  if (hours === 0) return "0h";
  if (hours < 10) return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
  return `${Math.round(hours)}h`;
}
