import { describe, expect, it } from "vitest";
import { kreshReal } from "./kreshReal";
import { loadMapFixture } from "./mapFixture";

describe("loadMapFixture", () => {
  it("derives the Kresh encounter through the production map processor", () => {
    const { props, startMs, endMs } = loadMapFixture(kreshReal);
    const encounter = props.result.encounters.get(kreshReal.encounter.id);

    expect(encounter?.positionsByUnit.size).toBeGreaterThan(0);
    expect(encounter?.healthByUnit.size).toBeGreaterThan(0);
    expect(encounter?.effects.events.length).toBeGreaterThan(0);
    expect(endMs - startMs).toBeGreaterThan(13_000);

    const instance = props.context.instance;
    const bosses = instance.encounters[0].enemies?.filter((enemy) => enemy.boss) ?? [];
    expect(bosses.map((boss) => instance.units?.[boss.id]?.entry)).toEqual([3653]);
    expect(encounter?.positionsByUnit.has(bosses[0].id)).toBe(true);
    expect(Object.keys(instance.players ?? {})).toHaveLength(5);
    expect(props.context.entitySelection.playerIds.size).toBe(0);
  });

  it("selects the five players when asked", () => {
    const { props } = loadMapFixture(kreshReal, { selectPlayers: true });
    expect(props.context.entitySelection.playerIds.size).toBe(5);
  });
});
