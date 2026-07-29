import { addDays, addWeeks, startOfWeek, subWeeks } from "date-fns";
import { describe, expect, it } from "vitest";
import type { RecentInstance } from "@/api/typesGenerated";
import {
  buildCompactCalendar,
  calculateCalendarCellSize,
  calculateNightScore,
  calculateWeekStreak,
  formatRaidHours,
  totalCalendarDuration,
} from "./compactCalendarUtils";

function instance(
  id: string,
  date: Date,
  overrides: Partial<RecentInstance> = {},
): RecentInstance {
  return {
    id,
    slug: id,
    name: "Naxxramas",
    realm_id: "realm",
    realm_name: "Turtle WoW",
    uploader_id: "uploader",
    uploader_name: "Uploader",
    uploaded_at: date.toISOString(),
    first_encounter_time: date.toISOString(),
    player_count: 40,
    boss_count: 10,
    boss_kills: 10,
    duration_ms: 3_600_000,
    has_youtube_video: false,
    recorder_name: "Recorder",
    difficulty_name: "40 Player",
    max_players: 40,
    dynamic_difficulty: 0,
    ...overrides,
  };
}

describe("compact calendar calculations", () => {
  it("uses the weighted boss clear ratio as the night score", () => {
    const date = new Date("2026-07-20T20:00:00Z");
    const score = calculateNightScore([
      instance("full", date, { boss_count: 10, boss_kills: 10 }),
      instance("partial", date, { boss_count: 5, boss_kills: 2 }),
    ]);

    expect(score).toBe(0.8);
  });

  it("does not double-count duplicate uploads", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    const raidDate = new Date("2026-07-27T20:00:00Z");
    const weeks = buildCompactCalendar(
      [
        instance("first", raidDate, { duplicate_group_id: "duplicate", duration_ms: 7_200_000 }),
        instance("second", raidDate, { duplicate_group_id: "duplicate", duration_ms: 7_200_000 }),
      ],
      2,
      now,
    );

    expect(totalCalendarDuration(weeks)).toBe(7_200_000);
    expect(weeks[1].days[0].instances).toHaveLength(1);
    expect(weeks[1].days[0].instanceGroups).toHaveLength(1);
    expect(weeks[1].days[0].instanceGroups[0]).toHaveLength(2);
  });

  it("keeps the previous streak alive before the current week has activity", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    const currentWeek = startOfWeek(now, { weekStartsOn: 1 });
    const firstWeek = subWeeks(currentWeek, 3);
    const raids = [0, 1, 2].map((weekIndex) =>
      instance(
        `week-${weekIndex}`,
        addDays(addWeeks(firstWeek, weekIndex), 1),
      ),
    );

    const weeks = buildCompactCalendar(raids, 4, now);
    expect(calculateWeekStreak(weeks)).toBe(3);
  });

  it("fits square cells to whichever panel dimension is tighter", () => {
    expect(calculateCalendarCellSize(640, 180, 13, 4)).toBeCloseTo(22.2857, 4);
    expect(calculateCalendarCellSize(300, 500, 13, 4)).toBeCloseTo(19.3846, 4);
  });

  it("formats short durations precisely and long durations compactly", () => {
    expect(formatRaidHours(5_400_000)).toBe("1.5h");
    expect(formatRaidHours(61.2 * 3_600_000)).toBe("61h");
  });
});
