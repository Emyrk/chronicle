import { describe, expect, it } from "vitest";
import { totalDamageBuckets, type TotalDamageDoneResult } from "./totalDamageDone.processor";

describe("totalDamageBuckets", () => {
  it("collapses multiple encounters into one continuous strip", () => {
    const result: TotalDamageDoneResult = {
      total: 100,
      encounters: new Map([
        ["first", {
          startMilli: 1_000,
          endMilli: 2_000,
          total: 30,
          events: [
            { offsetMilli: 250, amount: 10 },
            { offsetMilli: 750, amount: 20 },
          ],
        }],
        ["second", {
          startMilli: 5_000,
          endMilli: 6_000,
          total: 70,
          events: [
            { offsetMilli: 250, amount: 30 },
            { offsetMilli: 750, amount: 40 },
          ],
        }],
      ]),
    };

    expect(totalDamageBuckets(result, ["first", "second"], 4)).toEqual([
      { amount: 10 },
      { amount: 20 },
      { amount: 30 },
      { amount: 40 },
    ]);
  });

  it("ignores encounters outside the current selection", () => {
    const result: TotalDamageDoneResult = {
      total: 30,
      encounters: new Map([
        ["selected", {
          startMilli: 0,
          endMilli: 1_000,
          total: 10,
          events: [{ offsetMilli: 500, amount: 10 }],
        }],
        ["other", {
          startMilli: 0,
          endMilli: 1_000,
          total: 20,
          events: [{ offsetMilli: 500, amount: 20 }],
        }],
      ]),
    };

    const buckets = totalDamageBuckets(result, ["selected"], 2);
    expect(buckets.reduce((sum, bucket) => sum + bucket.amount, 0)).toBe(10);
  });
});
