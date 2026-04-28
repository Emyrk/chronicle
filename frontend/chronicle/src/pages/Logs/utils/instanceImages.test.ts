import { describe, expect, it } from "vitest";

import {
  DEFAULT_BACKGROUND,
  getInstanceAbbrev,
  getInstanceBackground,
  getInstanceCategory,
  getInstanceConfig,
} from "./instanceImages";

describe("instanceImages Warmane support", () => {
  it("classifies supported Warmane WotLK raids and dungeons", () => {
    expect(getInstanceCategory("Forge of Souls")).toBe("dungeon");
    expect(getInstanceCategory("Halls of Reflection")).toBe("dungeon");
    expect(getInstanceCategory("The Nexus")).toBe("dungeon");
    expect(getInstanceCategory("The Oculus")).toBe("dungeon");
    expect(getInstanceCategory("Vault of Archavon")).toBe("raid");
    expect(getInstanceCategory("Obsidian Sanctum")).toBe("raid");
    expect(getInstanceCategory("Eye of Eternity")).toBe("raid");
    expect(getInstanceCategory("Trial of the Crusader")).toBe("raid");
    expect(getInstanceCategory("Ruby Sanctum")).toBe("raid");
    expect(getInstanceCategory("Naxxramas")).toBe("raid");
  });

  it("returns explicit metadata for supported Warmane WotLK instances", () => {
    expect(getInstanceConfig("The Nexus")).toMatchObject({
      bossCount: 5,
      abbrev: "Nexus",
    });

    expect(getInstanceConfig("Forge of Souls")).toMatchObject({
      bossCount: 2,
      abbrev: "FoS",
    });

    expect(getInstanceConfig("Halls of Reflection")).toMatchObject({
      bossCount: 3,
      abbrev: "HoR",
    });

    expect(getInstanceConfig("The Oculus")).toMatchObject({
      bossCount: 4,
      abbrev: "Oculus",
    });

    expect(getInstanceConfig("Vault of Archavon")).toMatchObject({
      bossCount: 4,
      abbrev: "VoA",
    });

    expect(getInstanceConfig("Obsidian Sanctum")).toMatchObject({
      bossCount: 4,
      abbrev: "OS",
    });

    expect(getInstanceConfig("Eye of Eternity")).toMatchObject({
      bossCount: 1,
      abbrev: "EoE",
    });

    expect(getInstanceConfig("Trial of the Crusader")).toMatchObject({
      bossCount: 5,
      abbrev: "ToC",
    });

    expect(getInstanceConfig("Ruby Sanctum")).toMatchObject({
      bossCount: 4,
      abbrev: "RS",
    });
  });

  it("keeps unknown instances on fallback behavior", () => {
    expect(getInstanceCategory("Icecrown Citadel")).toBe("unknown");
    expect(getInstanceBackground("Icecrown Citadel")).toBe(DEFAULT_BACKGROUND);
    expect(getInstanceAbbrev("Icecrown Citadel")).toBe("Icecrown Citadel");
  });
});