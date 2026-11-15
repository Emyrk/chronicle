import { describe, expect, it } from "vitest";
import { featuredUnitCallouts, type ReplayFeaturedUnit } from "./replayFeaturedUnits";

const units: readonly ReplayFeaturedUnit[] = [
  { guid: "a", name: "Leeroy", role: "The charge", color: "#0af", marker: "square" },
  { guid: "b", name: "Anfrony", role: "Camera POV", color: "#0f0", marker: "triangle" },
];

describe("featured unit callouts", () => {
  it("puts each featured unit's name, role, colour and marker above it", () => {
    expect([...featuredUnitCallouts(units)!]).toEqual([
      ["a", { title: "Leeroy", subtitle: "The charge", color: "#0af", marker: "square" }],
      ["b", { title: "Anfrony", subtitle: "Camera POV", color: "#0f0", marker: "triangle" }],
    ]);
  });

  it("hands the view the same callouts every render for the same list", () => {
    expect(featuredUnitCallouts(units)).toBe(featuredUnitCallouts(units));
  });

  it("has none without featured units", () => {
    expect(featuredUnitCallouts(undefined)).toBeUndefined();
    expect(featuredUnitCallouts([])).toBeUndefined();
  });
});
