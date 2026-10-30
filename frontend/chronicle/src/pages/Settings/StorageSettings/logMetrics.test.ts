import { describe, expect, it } from "vitest";
import type { WoWLogGroup } from "@/api/queries";
import { activeQuotaBytes, allTimeBytes } from "./logMetrics";

describe("log storage metrics with append parts", () => {
  it("uses the cumulative logical file totals without double-counting displayed parts", () => {
    const group = {
      files: [
        {
          size_bytes: 1300,
          compressed_size_bytes: 620,
          parts: [
            { size_bytes: 300, compressed_size_bytes: 120 },
          ],
        },
      ],
    } as unknown as WoWLogGroup;

    expect(activeQuotaBytes(group)).toBe(620);
    expect(allTimeBytes(group)).toEqual({ originalBytes: 1300, quotaBytesAll: 620 });
  });
});
