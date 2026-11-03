import { describe, expect, it } from "vitest";
import { gahzrankaOcto } from "./gahzrankaOcto";
import { mandokirOcto } from "./mandokirOcto";
import { kreshReal } from "./kreshReal";
import { LEEROY_VIDEO_TIMESTAMPS, leeroyRookery } from "./leeroyRookery";
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

  it("loads the Leeroy Jenkins reconstruction with its eggs, whelps and deaths", () => {
    const { props, startMs, endMs } = loadMapFixture(leeroyRookery);
    const encounter = props.result.encounters.get(leeroyRookery.encounter.id);
    const guidOf = (name: string) => Object.entries(leeroyRookery.players).find(([, player]) => player.name === name)?.[0];
    const unitsNamed = (name: string) => Object.entries(leeroyRookery.units).filter(([, unit]) => unit.name === name).map(([guid]) => guid);

    expect(endMs - startMs).toBe(86_000);
    expect(Object.keys(props.context.instance.players ?? {})).toHaveLength(13);
    // Every unhatched egg and every whelp stands on the map from the pull.
    const eggs = unitsNamed("Rookery Egg");
    const whelps = unitsNamed("Rookery Whelp");
    expect(eggs.length + whelps.length).toBe(198);
    for (const guid of [...eggs, ...whelps]) expect(encounter?.positionsByUnit.get(guid)?.[0]?.timestampMs).toBe(startMs);
    // Internet Historian's map draws Basphemy dead at video 2:10.5 (46.5 s into the clip).
    const basphemy = encounter?.healthByUnit.get(guidOf("Basphemy")!);
    expect(basphemy?.at(-1)).toMatchObject({ timestampMs: startMs + 46_500, current: 0 });
    // Leeroy is alone in the Rookery before the raid follows.
    const leeroy = encounter?.positionsByUnit.get(guidOf("Leeroy")!);
    const atNinety = leeroy?.find((sample) => sample.timestampMs === startMs + 6_000);
    expect(atNinety?.x).toBeLessThan(105);
    // Nothing waits for the raid: Leeroy's eggs hatch and their whelps hit him
    // before anyone else is within 8 yd of him (video 1:38, 14 s into the clip).
    const leeroyGuid = guidOf("Leeroy")!;
    const hitsBeforeRaid = encounter?.effects.events.filter((event) => event.kind === "damage" && event.target === leeroyGuid && event.timestampMs < startMs + 14_000) ?? [];
    expect(hitsBeforeRaid.length).toBeGreaterThanOrEqual(5);
    // Everyone stays on the egg floor (z <= 97.5, which includes the low rubble the
    // eggs lie on) except Anfrony's one climb up the west ramp (2:13-2:23).
    for (const [guid, player] of Object.entries(leeroyRookery.players)) {
      for (const sample of encounter?.positionsByUnit.get(guid) ?? []) {
        const climbing = player.name === "Anfrony" && sample.timestampMs >= startMs + 49_000 && sample.timestampMs <= startMs + 59_000;
        if (!climbing) expect(sample.z ?? 0).toBeLessThanOrEqual(97.5);
      }
    }
    // The video sync maps 1:24 to the clip's first log second.
    expect(LEEROY_VIDEO_TIMESTAMPS[0]).toMatchObject({ video_time_seconds: 84, utc_time: leeroyRookery.encounter.startTime.slice(11, 19) });
  });

  it("selects the five players when asked", () => {
    const { props } = loadMapFixture(kreshReal, { selectPlayers: true });
    expect(props.context.entitySelection.playerIds.size).toBe(5);
  });
});
