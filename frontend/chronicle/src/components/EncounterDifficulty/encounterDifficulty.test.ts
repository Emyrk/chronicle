import { describe, expect, it } from "vitest";
import { type DifficultyEncounter, hardModeTierLabel, summarizeDifficulty } from "./encounterDifficulty";

describe("hardModeTierLabel", () => {
  it("names the tier with the boss's unit", () => {
    expect(hardModeTierLabel("Freya", { mode: "hard_mode", tier: 2 })).toBe("2 elders");
    expect(hardModeTierLabel("Yogg-Saron", { mode: "hard_mode", tier: 1 })).toBe("1 keeper");
    expect(hardModeTierLabel("Yogg-Saron", { mode: "hard_mode", tier: 0 })).toBe("0 keepers");
  });

  it("is undefined for untiered modes and unknown bosses", () => {
    expect(hardModeTierLabel("XT-002 Deconstructor", { mode: "hard_mode" })).toBeUndefined();
    expect(hardModeTierLabel("Freya", { mode: "hard_mode" })).toBeUndefined();
    expect(hardModeTierLabel("Somebody", { mode: "hard_mode", tier: 2 })).toBeUndefined();
  });
});

describe("summarizeDifficulty", () => {
  const boss = (name: string, kill_type: DifficultyEncounter["kill_type"], mode?: "heroic" | "hard_mode") =>
    ({ name, boss: true, kill_type, difficulty: mode && { mode } }) satisfies DifficultyEncounter;

  it("counts boss kills only, ignoring wipes and trash", () => {
    const summary = summarizeDifficulty([
      boss("Lord Marrowgar", "clean", "heroic"),
      boss("Rotface", "wipe", "heroic"),
      boss("Rotface", "clean"),
      boss("Festergut", "partial", "heroic"),
      { name: "Trash", boss: false, kill_type: "clean", difficulty: { mode: "heroic" } },
    ]);
    expect(summary.kills.map((k) => k.name)).toEqual(["Lord Marrowgar", "Rotface", "Festergut"]);
    expect(summary.heroicKills).toBe(2);
    expect(summary.hardModeKills).toBe(0);
    expect(summary.hasDifficulty).toBe(true);
  });

  it("reports no difficulty when no kill carries one", () => {
    expect(summarizeDifficulty([boss("Ignis", "clean"), boss("Hodir", "wipe", "hard_mode")]).hasDifficulty).toBe(false);
  });
});
