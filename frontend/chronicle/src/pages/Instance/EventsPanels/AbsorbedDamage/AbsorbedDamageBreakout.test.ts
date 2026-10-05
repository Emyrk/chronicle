import { describe, expect, it } from "vitest";
import type { PanelContext } from "../types";
import type { AbsorbedDamageResult } from "./absorbedDamage.processor";
import { buildAbsorbedDamageBreakoutData } from "./AbsorbedDamageBreakout";

const PLAYER_ID = "0x0000000000000001";
const PRIEST_ID = "0x0000000000000002";

function createContext(): PanelContext {
  return {
    instance: {
      players: {
        [PRIEST_ID]: { name: "Priest" },
      },
      units: {},
    },
    selectedEncounterIds: ["enc1"],
    entitySelection: {
      playerIds: new Set(),
      enemyIds: new Set(),
    },
  } as unknown as PanelContext;
}

function createResult(): AbsorbedDamageResult {
  return {
    EncounterAbsorbed: new Map(),
    EncounterAttribution: new Map([
      ["enc1", new Map([
        [PLAYER_ID, {
          byAbility: new Map([
            ["Power Word: Shield", { amount: 700, count: 2, spellId: 17 }],
          ]),
          bySource: new Map([[PRIEST_ID, 700]]),
        }],
      ])],
    ]),
  };
}

describe("buildAbsorbedDamageBreakoutData", () => {
  it("assigns any canonical absorbed total without attribution to Unknown", () => {
    const breakout = buildAbsorbedDamageBreakoutData(
      createResult(),
      PLAYER_ID,
      ["enc1"],
      1_000,
      createContext(),
    );

    expect(breakout.abilities.map(({ name, value }) => ({ name, value }))).toEqual([
      { name: "Power Word: Shield", value: 700 },
      { name: "Unknown", value: 300 },
    ]);
    expect(breakout.sources.map(({ targetName, value }) => ({ targetName, value }))).toEqual([
      { targetName: "Priest", value: 700 },
      { targetName: "Unknown", value: 300 },
    ]);
    expect(breakout.abilities.reduce((sum, ability) => sum + ability.value, 0)).toBe(1_000);
    expect(breakout.sources.reduce((sum, source) => sum + source.value, 0)).toBe(1_000);
  });

  it("uses a fully Unknown breakout when no attribution exists", () => {
    const result = createResult();
    result.EncounterAttribution.clear();

    const breakout = buildAbsorbedDamageBreakoutData(result, PLAYER_ID, ["enc1"], 450, createContext());

    expect(breakout.abilities).toHaveLength(1);
    expect(breakout.abilities[0]).toMatchObject({ name: "Unknown", value: 450 });
    expect(breakout.sources).toHaveLength(1);
    expect(breakout.sources[0]).toMatchObject({ targetName: "Unknown", value: 450 });
  });
});
