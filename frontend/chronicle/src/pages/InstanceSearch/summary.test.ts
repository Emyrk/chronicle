import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { formatDuration, formatEvidence, formatMinutes, formatSortValue, summarize } from "./summary";
import type { Node } from "./queryModel";

describe("summarize", () => {
  it("makes one readable chip per top-level condition", () => {
    const tree: Node = {
      and: [
        { field: "instance.name", op: "contains", value: "molten" },
        { any_encounter: { and: [{ field: "encounter.name", op: "=", value: "Ragnaros" }, { field: "encounter.killed", op: "=", value: true }] } },
        { count_players: { where: { field: "player.class", op: "=", value: "PRIEST" }, op: ">=", value: 3 } },
        { field: "instance.kill_time_parse", op: ">=", value: 90, bosses: ["Ragnaros", "Majordomo Executus"], match: "each", parse_scope: "realm" },
        { field: "instance.idle_time_ms", op: "<=", value: 300000 },
        { field: "instance.capability", op: "=", value: "unit-position" },
        { not: { any_player: { field: "player.sub_spec", op: "=", value: "Bear", on: "trash" } } },
      ],
    };
    expect(summarize(tree)).toEqual([
      `Zone contains "molten"`,
      `A pull: Name is "Ragnaros" & Killed`,
      `≥ 3 players with Class is Priest`,
      `Kill-time parse ≥ 90 on each of Ragnaros, Majordomo Executus vs realm`,
      `Idle time ≤ 300 seconds`,
      `Has Unit position`,
      `Not: A player: Sub-spec is "Bear" on trash`,
    ]);
    expect(summarize(undefined)).toEqual([]);
  });

  it("describes every example without gaps", () => {
    for (const ex of EXAMPLES) {
      for (const chip of summarize(ex.where)) expect(chip, ex.id).not.toContain("…");
    }
  });

  it("keeps second precision in duration conditions", () => {
    expect(summarize({ field: "instance.ranked_kill_time_ms", op: "<=", value: 1250 }))
      .toEqual(["Ranked boss kill time ≤ 1.25 seconds"]);
  });

  it("formats durations", () => {
    expect(formatMinutes(300000)).toBe("5 min");
    expect(formatMinutes(4500000)).toBe("1h 15m");
    expect(formatMinutes(7200000)).toBe("2h");
  });
});

describe("ranges and evidence values", () => {
  it("describes a between range", () => {
    expect(summarize({ field: "instance.clear_time_ms", op: "between", value: [3_600_000, 4_500_000] })).toEqual(["Clear time 3600 seconds – 4500 seconds"]);
    expect(summarize({ field: "instance.started_at", op: "between", value: ["2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"] })).toEqual(["Date 2026-10-01 – 2026-10-31"]);
  });
  it("formats durations as m:ss, or hours when long", () => {
    expect(formatDuration(107_000)).toBe("1:47");
    expect(formatDuration(59_400)).toBe("0:59");
    expect(formatDuration(4_380_000)).toBe("1h 13m");
  });
  it("formats evidence values for their field", () => {
    expect(formatEvidence("instance.kill_time_ms", 107_000)).toBe("1:47");
    expect(formatEvidence("player.dps", 912.345)).toBe("912.3");
    expect(formatEvidence("instance.clear_parse", 97)).toBe("97");
    expect(formatEvidence("instance.has_video", true)).toBe("yes");
    expect(formatEvidence("player.class", "DRUID")).toBe("Druid");
    expect(formatEvidence("player.sub_spec", "Cat")).toBe("Cat");
    expect(formatEvidence("player.sub_spec", "")).toBe("none");
    expect(formatEvidence("instance.started_at", "2026-10-15T19:00:00+00:00")).toBe("2026-10-15");
  });
});

describe("formatSortValue", () => {
  it("formats each sort's value for the results column", () => {
    expect(formatSortValue("instance.kill_time_ms", "107000")).toBe("1:47");
    expect(formatSortValue("instance.idle_time_ms", "4500000")).toBe("1h 15m");
    expect(formatSortValue("instance.clear_parse", "97.536")).toBe("97.5");
    expect(formatSortValue("instance.wipes", "3")).toBe("3");
    expect(formatSortValue("instance.deaths", undefined)).toBeNull();
  });
});
