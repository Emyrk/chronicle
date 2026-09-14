import { describe, expect, it } from "vitest";
import {
  groupProgression,
  progressionBossStatus,
  progressionTotal,
  progressionVariantLabel,
  type ProgressionEncounter,
} from "./progression";

function encounter(
  encounterName: string,
  overrides: Partial<ProgressionEncounter> = {},
): ProgressionEncounter {
  return {
    instance_name: "Ulduar",
    encounter_name: encounterName,
    difficulty_name: "10 Player",
    max_players: 10,
    kills: 1,
    last_killed_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupProgression", () => {
  it("shares canonical filtering and grouping across progression panels", () => {
    const progression = groupProgression(
      [
        encounter("Flame Leviathan", { kills: 3 }),
        encounter("Ignis the Furnace Master", { kills: 2 }),
        encounter("Elder Brightleaf", { kills: 5 }),
      ],
      new Map([
        ["Ulduar", new Set(["Flame Leviathan", "Ignis the Furnace Master", "Razorscale"])],
      ]),
    );

    expect(progression).toHaveLength(1);
    expect(progression[0].kills).toBe(5);
    expect(progression[0].variants[0]).toMatchObject({
      instanceName: "Ulduar",
      difficultyName: "10 Player",
      maxPlayers: 10,
      encountersDown: 2,
      killedBosses: ["Flame Leviathan", "Ignis the Furnace Master"],
      kills: 5,
    });
  });

  it("preserves encounters without canonical metadata and groups lockout variants", () => {
    const progression = groupProgression([
      encounter("Lucifron", {
        instance_name: "Molten Core",
        difficulty_name: "Normal",
        max_players: 40,
      }),
      encounter("Magmadar", {
        instance_name: "Molten Core",
        difficulty_name: "Normal",
        max_players: 40,
      }),
      encounter("Lucifron", {
        instance_name: "Molten Core",
        difficulty_name: "Heroic",
        max_players: 20,
      }),
    ]);

    expect(progression[0].variants).toHaveLength(2);
    expect(progression[0].variants[0].maxPlayers).toBe(40);
    expect(progression[0].variants[0].killedBosses).toEqual(["Lucifron", "Magmadar"]);
    expect(progression[0].variants[1].heroic).toBe(true);
  });
});

describe("progression presentation helpers", () => {
  it("uses canonical totals before fallback boss counts", () => {
    const [instance] = groupProgression([encounter("Flame Leviathan")]);
    expect(
      progressionTotal(
        instance.instanceName,
        instance.variants,
        new Map([["Ulduar", 15]]),
        new Map([["Ulduar", new Set(["Flame Leviathan", "Ignis"])]]),
      ),
    ).toBe(2);
  });

  it("formats short and long variant labels", () => {
    const variant = {
      difficultyName: "10 Player Heroic",
      maxPlayers: 10,
      heroic: true,
    };
    expect(progressionVariantLabel(variant)).toBe("10 HC");
    expect(progressionVariantLabel(variant, "long")).toBe("10-player 10 Player Heroic");
  });

  it("preserves canonical order when splitting killed and missing bosses", () => {
    expect(
      progressionBossStatus(
        ["Flame Leviathan", "Ignis", "Razorscale"],
        ["Razorscale", "Flame Leviathan", "Optional Boss"],
      ),
    ).toEqual({
      killed: ["Flame Leviathan", "Razorscale"],
      missing: ["Ignis"],
    });
  });

  it("reports a complete canonical set", () => {
    expect(progressionBossStatus(["Hodir", "Thorim"], ["Hodir", "Thorim"])).toEqual({
      killed: ["Hodir", "Thorim"],
      missing: [],
    });
  });
});
