import { describe, expect, it } from "vitest";
import type { SupportedInstance } from "@/api/typesGenerated";
import { getInstanceCategory } from "./instanceCategory";

const supportedInstances = [
  {
    name: "Tower of Karazhan",
    category: "raid",
    derived_names: ["Lower Tower of Karazhan", "Upper Tower of Karazhan"],
  },
  { name: "Molten Core", category: "raid" },
  { name: "Deadmines", category: "dungeon" },
] as SupportedInstance[];

describe("getInstanceCategory", () => {
  it("uses the category supplied by the supported instances API", () => {
    expect(getInstanceCategory("Molten Core", supportedInstances)).toBe("raid");
    expect(getInstanceCategory("Deadmines", supportedInstances)).toBe("dungeon");
  });

  it("matches instance names case-insensitively", () => {
    expect(getInstanceCategory("molten core", supportedInstances)).toBe("raid");
  });

  it("uses the parent category for derived instance names", () => {
    expect(getInstanceCategory("Lower Tower of Karazhan", supportedInstances)).toBe("raid");
  });

  it("returns unknown for instances missing from the supported response", () => {
    expect(getInstanceCategory("Unknown Instance", supportedInstances)).toBe("unknown");
    expect(getInstanceCategory("Molten Core", undefined)).toBe("unknown");
  });
});
