import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { formatMinutes, summarize } from "./summary";
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
      `Idle time ≤ 5 min`,
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

  it("formats durations", () => {
    expect(formatMinutes(300000)).toBe("5 min");
    expect(formatMinutes(4500000)).toBe("1h 15m");
    expect(formatMinutes(7200000)).toBe("2h");
  });
});
