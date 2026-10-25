import { describe, expect, it } from "vitest";
import type { PlayerMetricChartData, PlayerRowCosmetic } from "./PlayerMetricChartModel";
import { mapInstancePlayerCosmetics, mergePlayerCosmetics } from "./PlayerCosmeticsContext";

const player: PlayerMetricChartData = {
  playerID: "player-1",
  playerName: "Cosmetic Tester",
  className: "Mage",
  specialization: "",
  value: 100,
};

describe("PlayerCosmeticsContext helpers", () => {
  it("maps API selections by GUID and applies the limited treatment", () => {
    const cosmetics = mapInstancePlayerCosmetics({
      "player-1": {
        name_id: "name_gilded",
        background_id: "background_embers",
        border_id: "border_elite",
      },
    }, "limited");

    expect(cosmetics.get("player-1")).toEqual({
      nameClassName: "cosmetic-name-gilded",
      barClassName: "cosmetic-bar-embers cosmetic-still",
      barBackground: expect.any(String),
      borderClassName: "cosmetic-border-elite cosmetic-still",
    });
  });

  it("returns no mapped cosmetics when display is disabled", () => {
    const cosmetics = mapInstancePlayerCosmetics({
      "player-1": {
        name_id: "name_gilded",
        background_id: "background_satin",
        border_id: "",
      },
    }, "disabled");

    expect(cosmetics.size).toBe(0);
  });

  it("centrally enriches chart players while preserving explicit cosmetics", () => {
    const providerCosmetic: PlayerRowCosmetic = { nameClassName: "cosmetic-name-gilded" };
    const explicitCosmetic: PlayerRowCosmetic = { nameClassName: "explicit-name" };
    const cosmetics = new Map([["player-1", providerCosmetic]]);

    expect(mergePlayerCosmetics([player], cosmetics)[0].cosmetic).toBe(providerCosmetic);
    expect(mergePlayerCosmetics([{ ...player, cosmetic: explicitCosmetic }], cosmetics)[0].cosmetic)
      .toBe(explicitCosmetic);
  });
});
