import { beforeEach, describe, expect, it } from "vitest";
import {
  readProfileTargets,
  writeProfileTargets,
} from "./analysisProfileStorage";

const values = new Map<string, string>();
const localStorage = {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};
Object.defineProperty(globalThis, "window", {
  value: { localStorage },
  configurable: true,
});

describe("analysis profile target storage", () => {
  beforeEach(() => localStorage.clear());

  it("stores targets independently for each profile", () => {
    writeProfileTargets("fury", [{ stat: "hit", type: "minimum", value: 9 }]);
    writeProfileTargets("tank", [
      { stat: "defense", type: "minimum", value: 440 },
    ]);

    expect(readProfileTargets("fury")).toEqual([
      { stat: "hit", type: "minimum", value: 9 },
    ]);
    expect(readProfileTargets("tank")).toEqual([
      { stat: "defense", type: "minimum", value: 440 },
    ]);
  });

  it("removes empty profiles and ignores malformed stored targets", () => {
    writeProfileTargets("fury", [{ stat: "hit", type: "minimum", value: 9 }]);
    writeProfileTargets("fury", []);
    expect(readProfileTargets("fury")).toEqual([]);

    window.localStorage.setItem(
      "chronicle:gear-analysis-targets:v1",
      JSON.stringify({ broken: [{ stat: "hit", type: "between", value: 9 }] }),
    );
    expect(readProfileTargets("broken")).toEqual([]);
  });
});
