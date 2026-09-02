import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSTANCE_ACCENT,
  getInstanceAccentColor,
  getInstanceContentLevel,
} from "./instanceImages";

describe("getInstanceContentLevel", () => {
  it("returns the configured expansion level", () => {
    expect(getInstanceContentLevel("Molten Core", 40)).toBe(60);
    expect(getInstanceContentLevel("Black Temple", 25)).toBe(70);
    expect(getInstanceContentLevel("Icecrown Citadel", 25)).toBe(80);
  });

  it("uses raid size to distinguish reused instance names", () => {
    expect(getInstanceContentLevel("Naxxramas", 40)).toBe(60);
    expect(getInstanceContentLevel("Naxxramas", 25)).toBe(80);
    expect(getInstanceContentLevel("Onyxia's Lair", 10)).toBe(80);
  });

  it("does not guess when a reused instance has no raid size", () => {
    expect(getInstanceContentLevel("Naxxramas")).toBeUndefined();
    expect(getInstanceContentLevel("Unknown Instance", 40)).toBeUndefined();
  });
});

describe("getInstanceAccentColor", () => {
  it("returns the configured accent case-insensitively", () => {
    expect(getInstanceAccentColor("molten core")).toBe("#f97316");
  });

  it("returns the default accent for unknown instances", () => {
    expect(getInstanceAccentColor("Unknown Raid")).toBe(DEFAULT_INSTANCE_ACCENT);
  });
});
