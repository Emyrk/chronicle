import { describe, expect, it } from "vitest";
import { mergeAdjacentAuraSegments, summarizeAuraSources } from "./sourceSummary";

const segment = (
  sourceGuid: string | null,
  sourceName: string | null,
  startMs: number,
  endMs: number,
) => ({ sourceGuid, sourceName, startMs, endMs, encounterId: "enc1" });

describe("summarizeAuraSources", () => {
  it("collapses repeated segments into one compact source summary", () => {
    expect(summarizeAuraSources([
      segment("caster", "Brannor", 0, 1000),
      segment("caster", "Brannor", 2000, 5000),
      segment(null, null, 0, 500),
    ])).toEqual([
      { guid: "caster", name: "Brannor", uptimeMs: 4000, windows: 2 },
      { guid: null, name: null, uptimeMs: 500, windows: 1 },
    ]);
  });

  it("merges touching refresh segments from the same source", () => {
    expect(mergeAdjacentAuraSegments([
      segment("caster", "Brannor", 1000, 3000),
      segment("caster", "Brannor", 3000, 7000),
      segment("other", "Thessaly", 7000, 9000),
    ])).toEqual([
      segment("caster", "Brannor", 1000, 7000),
      segment("other", "Thessaly", 7000, 9000),
    ]);
  });

  it("does not merge matching sources across encounters", () => {
    expect(mergeAdjacentAuraSegments([
      segment("caster", "Brannor", 0, 5000),
      { ...segment("caster", "Brannor", 0, 5000), encounterId: "enc2" },
    ])).toHaveLength(2);
  });

  it("does not count negative segment durations", () => {
    expect(summarizeAuraSources([
      segment("caster", "Brannor", 5000, 3000),
    ])[0].uptimeMs).toBe(0);
  });
});
