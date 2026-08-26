import { describe, expect, it } from "vitest";
import {
  itemPickerLevelOptions,
  parseItemPickerLevel,
} from "./itemPickerLevel";

describe("item picker level filter", () => {
  it("lists every selectable level from the cap down to one", () => {
    expect(itemPickerLevelOptions(4)).toEqual([4, 3, 2, 1]);
    expect(itemPickerLevelOptions(0)).toEqual([]);
  });

  it("defaults to no level ceiling", () => {
    expect(parseItemPickerLevel("any", 80)).toBeUndefined();
  });

  it("turns the selected level into the item-search ceiling", () => {
    expect(parseItemPickerLevel("40", 80)).toBe(40);
    expect(parseItemPickerLevel("80", 80)).toBe(80);
    expect(parseItemPickerLevel("any", 80)).toBeUndefined();
  });

  it("clamps invalid or excessive values to the configured level cap", () => {
    expect(parseItemPickerLevel("90", 80)).toBe(80);
    expect(parseItemPickerLevel("invalid", 80)).toBe(80);
    expect(parseItemPickerLevel("0", 80)).toBe(80);
  });
});
