import { describe, expect, it } from "vitest";
import { getTimelineHoverSnapshot } from "./timelineHover";

const seriesMeta = new Map([
  ["damage", { name: "Damage Done", aggregation: "sum" }],
  ["healing", { name: "Healing", aggregation: "per_second" }],
]);

const series = [
  {
    id: "damage",
    color: "#3b82f6",
    data: [
      { x: 0, y: 0 },
      { x: 0.5, y: 100 },
      { x: 1, y: 25 },
    ],
  },
  {
    id: "healing",
    color: "#84cc16",
    data: [
      { x: 0, y: 0 },
      { x: 0.5, y: 40 },
      { x: 1, y: 75 },
    ],
  },
] as const;

describe("timeline hover", () => {
  it("selects the nearest point for non-one-second bins", () => {
    expect(getTimelineHoverSnapshot(series, 0.3, 500, seriesMeta)).toMatchObject({
      sec: 0.5,
      rows: [
        { seriesId: "damage", value: 100, perSecond: false },
        { seriesId: "healing", value: 40, perSecond: true },
      ],
    });
  });

  it("clamps to the first and last available points", () => {
    expect(getTimelineHoverSnapshot(series, -5, 500, seriesMeta)?.sec).toBe(0);
    expect(getTimelineHoverSnapshot(series, 99, 500, seriesMeta)?.sec).toBe(1);
  });

  it("sorts tooltip rows by value while preserving labels and colors", () => {
    expect(getTimelineHoverSnapshot(series, 0.9, 500, seriesMeta)?.rows).toEqual([
      {
        seriesId: "healing",
        name: "Healing",
        color: "#84cc16",
        value: 75,
        perSecond: true,
      },
      {
        seriesId: "damage",
        name: "Damage Done",
        color: "#3b82f6",
        value: 25,
        perSecond: false,
      },
    ]);
  });

  it("returns null when no hoverable data is available", () => {
    expect(getTimelineHoverSnapshot([], 1, 500, seriesMeta)).toBeNull();
    expect(getTimelineHoverSnapshot(series, 1, 0, seriesMeta)).toBeNull();
  });
});
