import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EFFECT_SETTINGS,
  EFFECTS_STORAGE_KEY,
  MAX_CHIP_SCALE_PERCENT,
  MIN_CHIP_SCALE_PERCENT,
  readStoredEffectSettings,
} from "./mapViewSettings";

const values = new Map<string, string>();
const localStorage = {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });

describe("map view settings", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the alignment overlay off by default", () => {
    expect(readStoredEffectSettings().alignmentOverlay).toBe(false);
  });

  it("restores the saved alignment overlay setting", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ alignmentOverlay: true }));

    expect(readStoredEffectSettings()).toEqual({
      ...DEFAULT_EFFECT_SETTINGS,
      alignmentOverlay: true,
    });
  });

  it("defaults the 3D chip scale to 100 percent", () => {
    expect(readStoredEffectSettings().chipScalePercent).toBe(100);
  });

  it("restores the saved 3D chip scale", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ chipScalePercent: 75 }));

    expect(readStoredEffectSettings().chipScalePercent).toBe(75);
  });

  it.each([
    [0, MIN_CHIP_SCALE_PERCENT],
    [999, MAX_CHIP_SCALE_PERCENT],
  ])("clamps a saved 3D chip scale of %s to %s percent", (stored, expected) => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ chipScalePercent: stored }));

    expect(readStoredEffectSettings().chipScalePercent).toBe(expected);
  });

  it("falls back to defaults when saved settings are invalid", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, "not json");

    expect(readStoredEffectSettings()).toEqual(DEFAULT_EFFECT_SETTINGS);
  });
});
