import { describe, expect, it } from "vitest";
import { formatCharParam, parseCharParam } from "./CharacterMatchPanel";

describe("Armory character query parameter", () => {
  it("round-trips a preselected realm and character", () => {
    const character = { realm: "Nordanaar", name: "Dauerschlaf" };
    expect(parseCharParam(formatCharParam(character))).toEqual(character);
  });

  it("rejects incomplete character parameters", () => {
    expect(parseCharParam(null)).toBeNull();
    expect(parseCharParam("Nordanaar")).toBeNull();
    expect(parseCharParam(":Dauerschlaf")).toBeNull();
    expect(parseCharParam("Nordanaar:")).toBeNull();
  });
});
