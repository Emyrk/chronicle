import { describe, expect, it } from "vitest";
import { classEntity, entityAttributes, parseEntity, performanceHistoryUrl, specEntity, type EntityRef } from "./entity";

describe("entity attributes", () => {
  it("round-trips through the data attribute", () => {
    const entity: EntityRef = { kind: "character", realm: "Nordanaar", guid: "0x02", name: "Afflicted", className: "Warlock" };
    expect(parseEntity(entityAttributes(entity)["data-entity"])).toEqual(entity);
  });

  it("round-trips class and spec summaries", () => {
    const stats = [{ label: "Typical", value: "1,234/s" }];
    const playerClass = classEntity("MAGE", "Mage", stats);
    const spec = specEntity("MAGE", "Mage", "Fire", undefined, stats);

    expect(parseEntity(entityAttributes(playerClass)["data-entity"])).toEqual(playerClass);
    expect(parseEntity(entityAttributes(spec)["data-entity"])).toEqual(spec);
    expect(spec.name).toBe("Fire Mage");
  });

  it("rejects values that aren't entities", () => {
    expect(parseEntity(undefined)).toBeNull();
    expect(parseEntity("not json")).toBeNull();
    expect(parseEntity(JSON.stringify({ kind: "character", name: "No realm" }))).toBeNull();
    expect(parseEntity(JSON.stringify({ kind: "unit", id: "1", name: "Ragnaros" }))).toBeNull();
  });

  it("links a character into performance history", () => {
    expect(performanceHistoryUrl({ kind: "character", realm: "Tel'Abim", guid: "0x02", name: "Afflicted" })).toBe(
      "/performance-history?player=0x02&player_realm=Tel%27Abim",
    );
  });
});
