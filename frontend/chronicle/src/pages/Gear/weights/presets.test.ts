import { describe, expect, it } from "vitest";
import { CLASS_NAME_TO_ID, SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";
import { STAT_KEYS } from "../builder/gearScoring";
import { flavorFromTags, presetsForFlavor, WEIGHT_PRESETS } from "./presets";

const VALID_KEYS = new Set(STAT_KEYS.map((s) => s.key));
const VALID_CLASS_IDS = new Set(Object.values(CLASS_NAME_TO_ID));
const ID_TO_ENUM = Object.fromEntries(
  Object.entries(CLASS_NAME_TO_ID).map(([name, id]) => [id, name]),
);

describe("WEIGHT_PRESETS", () => {
  it("has unique ids", () => {
    const ids = WEIGHT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(WEIGHT_PRESETS.map((p) => [p.id, p] as const))("%s is well-formed", (_id, preset) => {
    expect(preset.name.length).toBeGreaterThan(0);
    expect(preset.description.length).toBeGreaterThan(0);
    expect(VALID_CLASS_IDS.has(preset.classId)).toBe(true);

    // Spec must be a real spec of the class so filters and labels line up.
    const specs = SPEC_BY_CLASS[ID_TO_ENUM[preset.classId]];
    expect(specs).toContain(preset.specName);

    // Every weight key must be a canonical stat key with a usable value.
    const entries = Object.entries(preset.weights);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(VALID_KEYS.has(key), `unknown stat key ${key}`).toBe(true);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("has no cross-flavor placeholder duplicates", () => {
    // The wowsims Classic sim is forked from the WotLK codebase and ships
    // verbatim WotLK EP numbers for some specs; those must never appear as
    // vanilla presets (per-rating weights masquerading as per-percent).
    for (const a of WEIGHT_PRESETS) {
      for (const b of WEIGHT_PRESETS) {
        if (a.id >= b.id || a.flavor === b.flavor || a.classId !== b.classId) continue;
        const entriesA = Object.entries(a.weights);
        const shared = entriesA.filter(([k, v]) => b.weights[k] === v).length;
        const overlap = shared / Math.min(entriesA.length, Object.keys(b.weights).length);
        expect(
          overlap < 0.8,
          `${a.id} and ${b.id} share ${shared} identical weights — likely a placeholder copy`,
        ).toBe(true);
      }
    }
  });

  it("covers every class in every flavor", () => {
    for (const flavor of ["vanilla", "tbc", "wrath"] as const) {
      const classIds = new Set(
        WEIGHT_PRESETS.filter((p) => p.flavor === flavor).map((p) => p.classId),
      );
      const expected = flavor === "wrath" ? 10 : 9; // Death Knight is wrath-only
      expect(classIds.size, `${flavor} class coverage`).toBe(expected);
      if (flavor !== "wrath") {
        expect(classIds.has(CLASS_NAME_TO_ID.DEATHKNIGHT)).toBe(false);
      }
    }
  });
});

describe("flavor selection", () => {
  it("maps dataset flavor tags", () => {
    expect(flavorFromTags(["wrath"])).toBe("wrath");
    expect(flavorFromTags(["tbc"])).toBe("tbc");
    expect(flavorFromTags(["vanilla", "turtle"])).toBe("vanilla");
    expect(flavorFromTags([])).toBe("vanilla");
  });

  it("filters presets by flavor", () => {
    const vanilla = presetsForFlavor(["vanilla"]);
    expect(vanilla.length).toBeGreaterThan(0);
    expect(vanilla.every((p) => p.flavor === "vanilla")).toBe(true);
  });
});
