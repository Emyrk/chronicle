import { describe, expect, it } from "vitest";
import { gahzrankaOcto } from "./gahzrankaOcto";
import { mandokirOcto } from "./mandokirOcto";
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

  it("loads the captured Bloodlord Mandokir encounter", () => {
    const { props, startMs, endMs } = loadMapFixture(mandokirOcto);
    const encounter = props.result.encounters.get(mandokirOcto.encounter.id);

    expect(mandokirOcto.encounter.name).toBe("Bloodlord Mandokir");
    expect(encounter?.positionsByUnit.size).toBeGreaterThan(0);
    expect(encounter?.effects.events.length).toBeGreaterThan(0);
    expect(endMs - startMs).toBeGreaterThan(43_000);
    expect(Object.keys(props.context.instance.players ?? {})).toHaveLength(16);
    expect(props.context.instance.encounters[0].enemies?.filter((enemy) => enemy.boss)).toHaveLength(2);
  });

  it("loads the captured Gahz'ranka encounter", () => {
    const { props, startMs, endMs } = loadMapFixture(gahzrankaOcto);
    const encounter = props.result.encounters.get(gahzrankaOcto.encounter.id);

    expect(gahzrankaOcto.encounter.name).toBe("Gahz'ranka");
    expect(encounter?.positionsByUnit.size).toBeGreaterThan(0);
    expect(encounter?.effects.events.some((event) => event.spellName === "Gahz'ranka Slam")).toBe(true);
    expect(encounter?.effects.events.some((event) => event.spellName === "Massive Geyser")).toBe(true);
    expect(endMs - startMs).toBeGreaterThan(32_000);
    expect(Object.keys(props.context.instance.players ?? {})).toHaveLength(16);
  });

  it("selects the five players when asked", () => {
    const { props } = loadMapFixture(kreshReal, { selectPlayers: true });
    expect(props.context.entitySelection.playerIds.size).toBe(5);
  });
});
