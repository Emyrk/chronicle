import { describe, expect, it } from "vitest";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { buildMeterValuesModel } from "./meterBarsModel";

const row = (playerName: string, value: number): PlayerMetricChartData => ({
  playerID: playerName,
  playerName,
  className: "WARRIOR",
  specialization: "",
  value,
});

describe("meter values model", () => {
  const data = [row("c", 30), row("a", 100), row("g", 5), row("b", 60), row("e", 10), row("f", 8), row("d", 20)];

  it("shows the top five by value and counts the rest as +N more", () => {
    const model = buildMeterValuesModel(data, {});
    expect(model.rows.map((r) => r.row.playerName)).toEqual(["a", "b", "c", "d", "e"]);
    expect(model.more).toBe(2);
    expect(buildMeterValuesModel(data, { limit: 3 }).more).toBe(4);
    expect(buildMeterValuesModel(data, { limit: 10 }).more).toBe(0);
  });

  it("shares against the sum by default, or a given base (% of tank)", () => {
    expect(buildMeterValuesModel(data, {}).rows[0].share).toBe("42.9%");
    const ofTank = buildMeterValuesModel(data, { shareBase: 100, formatShare: (s) => `${Math.round(s * 100)}%` });
    expect(ofTank.rows.map((r) => r.share)).toEqual(["100%", "60%", "30%", "20%", "10%"]);
  });

  it("places markers on the bar scale and drops off-scale ones", () => {
    const model = buildMeterValuesModel(data, {
      scaleMax: 200,
      markers: [
        { value: 110, color: "#f0a8a8" },
        { value: 130, color: "#ec1337" },
        { value: 250, color: "#fff" },
      ],
    });
    expect(model.markers.map((m) => Math.round(m.leftPct))).toEqual([55, 65]);
    expect(model.rows[0].widthPct).toBe(50);
    // Without scaleMax the top row is full width and a 110% marker is off the scale.
    expect(buildMeterValuesModel(data, { markers: [{ value: 110, color: "#fff" }] }).markers).toEqual([]);
  });

  it("tags rows", () => {
    const model = buildMeterValuesModel(data, { tagFor: (r) => (r.playerName === "a" ? { label: "tank" } : undefined) });
    expect(model.rows.map((r) => r.tag?.label)).toEqual(["tank", undefined, undefined, undefined, undefined]);
  });

  it("keeps a pinned row first, still scaled against the top value", () => {
    const model = buildMeterValuesModel(data, { pinFirst: (r) => r.playerName === "e", limit: 3 });
    expect(model.rows.map((r) => r.row.playerName)).toEqual(["e", "a", "b"]);
    expect(model.rows.map((r) => r.widthPct)).toEqual([10, 100, 60]);
  });
});
