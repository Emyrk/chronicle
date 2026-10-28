import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EFFECT_SETTINGS, EFFECTS_STORAGE_KEY, readStoredEffectSettings } from "./mapViewSettings";

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

  it("falls back to defaults when saved settings are invalid", () => {
    localStorage.setItem(EFFECTS_STORAGE_KEY, "not json");

    expect(readStoredEffectSettings()).toEqual(DEFAULT_EFFECT_SETTINGS);
  });
});
