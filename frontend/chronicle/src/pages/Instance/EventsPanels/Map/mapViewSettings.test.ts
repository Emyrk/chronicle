import { beforeEach, describe, expect, it } from "vitest";
import {
  ABOVE_DISC_HEALTH_DEFAULT_STORAGE_KEY,
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

  it("shows health above 3D map tokens by default", () => {
    expect(readStoredEffectSettings().aboveDisc).toBe("health");
  });

  it("forces the new health default over an existing saved choice until they opt out", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ aboveDisc: "none" }));

    expect(readStoredEffectSettings().aboveDisc).toBe("health");
    expect(readStoredEffectSettings().aboveDisc).toBe("health");
    expect(localStorage.getItem(ABOVE_DISC_HEALTH_DEFAULT_STORAGE_KEY)).toBe("1");
  });

  it("preserves an explicit opt-out after the health default was applied", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ aboveDisc: "none" }));
    localStorage.setItem(ABOVE_DISC_HEALTH_DEFAULT_STORAGE_KEY, "1");

    expect(readStoredEffectSettings().aboveDisc).toBe("none");
  });

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

  it("hides map-specific units by default", () => {
    expect(readStoredEffectSettings().showHiddenUnits).toBe(false);
  });

  it("restores the saved hidden-unit visibility setting", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ showHiddenUnits: true }));

    expect(readStoredEffectSettings().showHiddenUnits).toBe(true);
  });

  it("uses miniatures with game-model fallback by default", () => {
    expect(readStoredEffectSettings().gameModelsOnly).toBe(false);
  });

  it("restores the original-model-only setting", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ gameModelsOnly: true }));

    expect(readStoredEffectSettings().gameModelsOnly).toBe(true);
  });

  it("rejects a non-boolean original-model-only setting", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify({ gameModelsOnly: "yes" }));

    expect(readStoredEffectSettings().gameModelsOnly).toBe(false);
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
