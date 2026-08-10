import { describe, expect, it } from "vitest";
import { UnitState } from "./unitState";

const vehicle = "0xF150006C6B000107";
const firstController = "0x000000000008CC7B";
const secondController = "0x000000000009EC32";

describe("UnitState ownership chains", () => {
  const player = "0x000000000008CC7B";
  const totem = "0xF130003C4F0003D3";
  const elemental = "0xF130003C4E0003D4";

  it("returns a direct owner without walking a chain", () => {
    const state = new UnitState({
      [elemental]: { name: "Greater Fire Elemental", owner: player, entry: 15438 },
    });

    expect(state.getOwner(elemental)).toBe(player);
  });

  it("flattens a summon owned through another summon", () => {
    const state = new UnitState({
      [elemental]: { name: "Greater Fire Elemental", owner: totem, entry: 15438 },
      [totem]: { name: "Fire Elemental Totem", owner: player, entry: 15439 },
    });

    expect(state.getOwner(elemental)).toBe(player);
    expect(state.isPlayerPet(elemental)).toBe(true);
  });

  it("rejects cyclic ownership", () => {
    const state = new UnitState({
      [elemental]: { name: "Greater Fire Elemental", owner: totem, entry: 15438 },
      [totem]: { name: "Fire Elemental Totem", owner: elemental, entry: 15439 },
    });

    expect(state.getOwner(elemental)).toBeNull();
    expect(state.isPlayerPet(elemental)).toBe(false);
  });

  it("bounds ownership resolution to five hops", () => {
    const owners = ["owner-1", "owner-2", "owner-3", "owner-4", "owner-5", "owner-6"];
    const units: Record<string, { name: string; owner: string | null; entry: number }> = {
      summon: { name: "Summon", owner: owners[0], entry: 1 },
    };
    for (let i = 0; i < owners.length; i++) {
      units[owners[i]] = {
        name: owners[i],
        owner: owners[i + 1] ?? player,
        entry: i + 2,
      };
    }

    const state = new UnitState(units);
    expect(state.getOwner("summon")).toBe(owners[4]);
  });
});

describe("UnitState vehicle ownership", () => {
  it("treats active vehicle control as temporal pet ownership", () => {
    const state = new UnitState(
      { [vehicle]: { name: "Amber Drake", owner: firstController, entry: 27755 } },
      [{
        vehicleGuid: vehicle,
        controllerGuid: firstController,
        assignedAtMs: 1_000,
        releasedAtMs: 2_000,
      }],
    );

    // Vehicle metadata is authoritative over stale static ownership.
    state.setCurrentTimestamp(999);
    expect(state.getOwner(vehicle)).toBeNull();
    expect(state.isPet(vehicle)).toBe(false);

    state.setCurrentTimestamp(1_000);
    expect(state.getOwner(vehicle)).toBe(firstController);
    expect(state.isPlayerPet(vehicle)).toBe(true);

    state.setCurrentTimestamp(1_999);
    expect(state.getOwner(vehicle)).toBe(firstController);

    state.setCurrentTimestamp(2_000);
    expect(state.getOwner(vehicle)).toBeNull();
  });

  it("resolves controller changes from the latest active interval", () => {
    const state = new UnitState({}, [
      {
        vehicleGuid: vehicle,
        controllerGuid: firstController,
        assignedAtMs: 1_000,
        releasedAtMs: 2_000,
      },
      {
        vehicleGuid: vehicle,
        controllerGuid: secondController,
        assignedAtMs: 2_000,
        releasedAtMs: null,
      },
    ]);

    state.setCurrentTimestamp(1_500);
    expect(state.getOwner(vehicle)).toBe(firstController);

    state.setCurrentTimestamp(2_000);
    expect(state.getOwner(vehicle)).toBe(secondController);
  });

  it("keeps inline possession higher priority than vehicle metadata", () => {
    const possessionController = "0x00000000000A3A9E";
    const state = new UnitState({}, [{
      vehicleGuid: vehicle,
      controllerGuid: firstController,
      assignedAtMs: 1_000,
      releasedAtMs: null,
    }]);
    state.setCurrentTimestamp(1_500);

    state.processClassification({
      type: "unit_classification",
      index: 0,
      offsetMilli: 0,
      target: vehicle,
      unitType: 4,
      affiliation: 0,
      owner: null,
      controller: possessionController,
      spellId: 1,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    });
    expect(state.getOwner(vehicle)).toBe(possessionController);

    state.processClassification({
      type: "unit_classification",
      index: 1,
      offsetMilli: 1,
      target: vehicle,
      unitType: 4,
      affiliation: 0,
      owner: null,
      controller: null,
      spellId: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    });
    expect(state.getOwner(vehicle)).toBe(firstController);
  });
});
