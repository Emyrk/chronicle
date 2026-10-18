import { describe, expect, it } from "vitest";
import {
  raidDurabilityMode,
  replayStripVariant,
  stripTitleMode,
  updateRaidDurabilityMode,
  updateReplayStripVariant,
  updateStripTitleMode,
} from "./stripOptions";

describe("strip title mode", () => {
  it("defaults to none", () => {
    expect(stripTitleMode(null)).toBe("none");
  });

  it("persists a title mode while preserving other options", () => {
    expect(updateStripTitleMode("bc:#ef4444", "large"))
      .toBe("bc:#ef4444,title-mode:large");
  });

  it("replaces an existing title mode", () => {
    expect(updateStripTitleMode("title-mode:large,t:Custom", "overlay"))
      .toBe("t:Custom,title-mode:overlay");
  });

  it("removes title mode tokens when set to none", () => {
    expect(updateStripTitleMode("title-mode:overlay,t:Custom", "none"))
      .toBe("t:Custom");
  });

  it("reads the legacy show-title token as overlay", () => {
    expect(stripTitleMode("show-title")).toBe("overlay");
  });
});

describe("raid durability mode", () => {
  it("defaults to actual only when the capability is supported", () => {
    expect(raidDurabilityMode(null, true)).toBe("actual");
    expect(raidDurabilityMode(null, false)).toBe("estimate");
  });

  it("falls back to estimate when an actual option is unsupported", () => {
    expect(raidDurabilityMode("durability-mode:actual", false)).toBe("estimate");
  });

  it("persists the selected mode while preserving other options", () => {
    expect(updateRaidDurabilityMode("title-mode:large,t:Custom", "estimate"))
      .toBe("title-mode:large,t:Custom,durability-mode:estimate");
  });
});

describe("replay strip variant", () => {
  it("defaults to durability, also for unknown values", () => {
    expect(replayStripVariant(null)).toBe("durability");
    expect(replayStripVariant("variant:nope")).toBe("durability");
    expect(replayStripVariant("bc:#ef4444,variant:damage")).toBe("damage");
  });

  it("stores only a non-default variant, keeping other options", () => {
    expect(updateReplayStripVariant("bc:#ef4444", "slider")).toBe("bc:#ef4444,variant:slider");
    expect(updateReplayStripVariant("bc:#ef4444,variant:slider", "damage")).toBe("bc:#ef4444,variant:damage");
    expect(updateReplayStripVariant("variant:damage", "durability")).toBeNull();
  });
});
