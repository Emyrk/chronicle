import { describe, expect, it } from "vitest";
import { compactDeathRows, formatDeathClock, isCompactDeathsOption, type CompactDeathRow } from "./compactDeaths";

function row(encounterID: string, dateMilli: number): CompactDeathRow {
  return { dateMilli, encounterID, playerID: `p-${dateMilli}`, playerName: "Jolly", className: "MAGE", killerName: "The Butcher" };
}

describe("compact deaths", () => {
  it("is a panel option token", () => {
    expect(isCompactDeathsOption("compact")).toBe(true);
    expect(isCompactDeathsOption("g:merged,compact")).toBe(true);
    expect(isCompactDeathsOption(null)).toBe(false);
    expect(isCompactDeathsOption("compactish")).toBe(false);
  });

  it("keeps the selected encounters' deaths, oldest first", () => {
    const rows = [row("b", 3_000), row("a", 2_000), row("c", 1_000)];
    expect(compactDeathRows(rows, ["a", "b"]).map((death) => death.dateMilli)).toEqual([2_000, 3_000]);
  });

  it("formats elapsed time like a replay clock", () => {
    expect(formatDeathClock(0)).toBe("0:00");
    expect(formatDeathClock(581_400)).toBe("9:41");
    expect(formatDeathClock(3_723_000)).toBe("1:02:03");
    expect(formatDeathClock(-5)).toBe("0:00");
  });
});
