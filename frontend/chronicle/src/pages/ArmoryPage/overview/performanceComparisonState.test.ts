import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERFORMANCE_COMPARISON_STATE,
  parsePerformanceComparisonState,
  serializePerformanceComparisonState,
} from "./performanceComparisonState";

describe("performance comparison URL state", () => {
  it("round-trips players, independent filters, and shared controls", () => {
    const state = {
      ...DEFAULT_PERFORMANCE_COMPARISON_STATE,
      realmName: "N'Zoth",
      players: [
        { id: "player-1", spec: "Shadow", subSpec: "Deep Shadow", hidden: false },
        { id: "player-2", spec: "Fire", subSpec: null, hidden: true },
      ],
      metric: "hps" as const,
      display: "parse" as const,
      dateRange: "60d" as const,
      instanceName: "Molten Core",
      difficultyName: "Normal",
      maxPlayers: 40,
      encounters: ["Garr", "Magmadar"],
      showAverage: false,
      showBestThreeAverage: false,
    };

    expect(parsePerformanceComparisonState(serializePerformanceComparisonState(state))).toEqual(state);
  });

  it("uses safe defaults and limits the comparison to five players", () => {
    const searchParams = new URLSearchParams("metric=invalid&display=invalid&range=all&size=nope");
    for (let index = 0; index < 7; index += 1) searchParams.append("player", `player-${index}`);

    const state = parsePerformanceComparisonState(searchParams);

    expect(state.players).toHaveLength(5);
    expect(state.metric).toBe("dps");
    expect(state.display).toBe("raw");
    expect(state.dateRange).toBe("180d");
    expect(state.maxPlayers).toBe(0);
  });

  it("restores hidden players by id without changing player alignment", () => {
    const searchParams = new URLSearchParams();
    searchParams.append("player", "player-1");
    searchParams.append("player", "player-2");
    searchParams.append("hidden", "player-2");

    expect(parsePerformanceComparisonState(searchParams).players).toEqual([
      { id: "player-1", spec: null, subSpec: null, hidden: false },
      { id: "player-2", spec: null, subSpec: null, hidden: true },
    ]);
  });

  it("preserves empty aligned spec values between players", () => {
    const searchParams = new URLSearchParams();
    searchParams.append("player", "player-1");
    searchParams.append("player", "player-2");
    searchParams.append("spec", "");
    searchParams.append("spec", "Fire");
    searchParams.append("subspec", "");
    searchParams.append("subspec", "Deep Fire");

    expect(parsePerformanceComparisonState(searchParams).players).toEqual([
      { id: "player-1", spec: null, subSpec: null, hidden: false },
      { id: "player-2", spec: "Fire", subSpec: "Deep Fire", hidden: false },
    ]);
  });
});
