import { describe, expect, it } from "vitest";
import { TALENT_TREES_STALE_TIME_MS } from "./useTalentTrees";

describe("talent tree query cache", () => {
  it("stays fresh for two hours", () => {
    expect(TALENT_TREES_STALE_TIME_MS).toBe(2 * 60 * 60 * 1000);
  });
});
