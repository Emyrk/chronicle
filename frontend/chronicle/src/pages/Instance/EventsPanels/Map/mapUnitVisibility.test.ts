import { describe, expect, it } from "vitest";
import { isMapUnitDespawned, isMapUnitPositionExpired, mapUnitMaxPositionAgeMs, shouldShowMapUnit } from "./mapUnitVisibility";

describe("map unit visibility", () => {
  it.each([25121, 25132])("hides V+ Scarlet Monastery entry %s", (entry) => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], entry)).toBe(false);
  });

  it("keeps other V+ Scarlet Monastery units visible", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], 25122)).toBe(true);
  });

  it("does not hide matching entries outside V+ Scarlet Monastery", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", [], 25121)).toBe(true);
    expect(shouldShowMapUnit("Scarlet Monastery Armory", ["vanillaplus"], 25121)).toBe(true);
  });

  it("keeps units without entry metadata visible", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], undefined)).toBe(true);
  });

  it("reveals suppressed entries when hidden units are enabled", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], 25121, true)).toBe(true);
  });

  it("keeps an egg until its hatch timestamp and never expires unhatched eggs", () => {
    expect(isMapUnitDespawned(9_000, 8_999)).toBe(false);
    expect(isMapUnitDespawned(9_000, 9_000)).toBe(true);
    expect(isMapUnitDespawned(undefined, 30_000)).toBe(false);
  });

  it("expires Nightmare of Ursol Shadowflame Sparks after their position telemetry stops", () => {
    expect(mapUnitMaxPositionAgeMs("Blackwing Lair", ["nightmare-of-ursol"], 65151)).toBe(500);
    expect(isMapUnitPositionExpired("Blackwing Lair", ["nightmare-of-ursol"], 65151, 1_000, 1_500)).toBe(false);
    expect(isMapUnitPositionExpired("Blackwing Lair", ["nightmare-of-ursol"], 65151, 1_000, 1_501)).toBe(true);
  });

  it("does not expire the same entry outside the matching BWL flavor", () => {
    expect(mapUnitMaxPositionAgeMs("Blackwing Lair", ["turtle"], 65151)).toBeNull();
    expect(isMapUnitPositionExpired("Blackwing Lair", ["turtle"], 65151, 1_000, 10_000)).toBe(false);
    expect(isMapUnitPositionExpired("Molten Core", ["nightmare-of-ursol"], 65151, 1_000, 10_000)).toBe(false);
  });
});
