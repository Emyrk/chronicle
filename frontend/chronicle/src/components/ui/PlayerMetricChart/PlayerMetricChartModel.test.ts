import { describe, expect, it } from "vitest";
import {
  createPlayerMetricChartModel,
  displayMetricValue,
  type PlayerMetricChartData,
} from "./PlayerMetricChartModel";

const data: PlayerMetricChartData[] = [
  {
    playerID: "player-b",
    playerName: "Bravo",
    className: "Mage",
    specialization: "Fire",
    value: 100,
    stackedValue: 20,
  },
  {
    playerID: "player-a",
    playerName: "Alpha",
    className: "Priest",
    specialization: "Shadow",
    value: 50,
  },
];

describe("createPlayerMetricChartModel", () => {
  it("keeps chart geometry stable when only the per-second duration changes", () => {
    const first = createPlayerMetricChartModel(data, true, 1_000);
    const second = createPlayerMetricChartModel(data, true, 2_000);

    expect(second.maximumValue).toBe(first.maximumValue);
    expect(second.summedValue).toBe(first.summedValue);
    expect(second.chartData.map((row) => row.playerID)).toEqual(
      first.chartData.map((row) => row.playerID),
    );
    expect(second.chartData.map((row) => row.value)).toEqual(
      first.chartData.map((row) => row.value),
    );
    expect(second.chartData[0].displayValue).toBe(first.chartData[0].displayValue / 2);
    expect(second.chartData[0].displayStackedValue).toBe(
      first.chartData[0].displayStackedValue! / 2,
    );
  });

  it("uses player ID as a deterministic tie-breaker", () => {
    const tied = data.map((row) => ({ ...row, value: 100 }));

    const model = createPlayerMetricChartModel(tied, false, undefined);

    expect(model.chartData.map((row) => row.playerID)).toEqual([
      "player-a",
      "player-b",
    ]);
  });

  it("keeps dimmed rows below active rows before applying the tie-breaker", () => {
    const tied = data.map((row) => ({
      ...row,
      value: 100,
      dimmed: row.playerID === "player-a",
    }));

    const model = createPlayerMetricChartModel(tied, false, undefined);

    expect(model.chartData.map((row) => row.playerID)).toEqual([
      "player-b",
      "player-a",
    ]);
  });

  it("returns finite display values at zero replay duration", () => {
    const model = createPlayerMetricChartModel(data, true, 0);

    expect(model.chartData.every((row) => Number.isFinite(row.displayValue))).toBe(true);
    expect(model.chartData[0].displayValue).toBe(0);
    expect(model.chartData[0].displayStackedValue).toBe(0);
  });
});

describe("displayMetricValue", () => {
  it("leaves totals unchanged when per-second display is disabled", () => {
    expect(displayMetricValue(123, false, 0)).toBe(123);
  });
});
