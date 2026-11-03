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

  it("keeps the cinematic combat, health and power timelines internally consistent", () => {
    const fixture = leeroyRookery;
    const guidOf = (name: string) => Object.entries(fixture.players).find(([, player]) => player.name === name)?.[0];
    const anfrony = guidOf("Anfrony")!;
    const rows = fixture.events;
    const guid = (index: number) => fixture.guids[index];
    const playerIDs = new Set(Object.keys(fixture.players));
    const health = new Map<string, number>();
    const power = new Map<string, number>();
    const deaths = new Map<string, number>();
    let playerDamage = 0;
    let playerHealing = 0;
    let manaSpent = 0;
    let anfronyAt24: number | undefined;
    for (const row of rows) {
      const [code, time] = row;
      if (code === "d" || code === "h") {
        const source = guid(Number(row[2]));
        const target = guid(Number(row[3]));
        const amount = Number(row[4]);
        expect(amount).toBeGreaterThan(0);
        if (code === "d" && playerIDs.has(source)) playerDamage += amount;
        if (code === "h" && playerIDs.has(source)) playerHealing += amount;
        if (health.has(target)) health.set(target, health.get(target)! + (code === "h" ? amount : -amount));
      } else if (code === "m") {
        const target = guid(Number(row[2]));
        const amount = Number(row[3]);
        const direction = row[4];
        expect(["Gain", "Loss"]).toContain(direction);
        if (row[6] === "Mana" && direction === "Loss") manaSpent += amount;
        const visibleAmount = row[6] === "Rage" ? amount / 10 : amount;
        if (power.has(target)) power.set(target, power.get(target)! + (direction === "Gain" ? visibleAmount : -visibleAmount));
      } else if (code === "r") {
        const target = guid(Number(row[2]));
        const current = Number(row[3]);
        const max = Number(row[4]);
        expect(current).toBeGreaterThanOrEqual(0);
        expect(current).toBeLessThanOrEqual(max);
        if (health.has(target)) expect(current).toBe(health.get(target));
        health.set(target, current);
        if (playerIDs.has(target)) {
          const currentPower = Number(row[6]);
          const maxPower = Number(row[7]);
          expect(currentPower).toBeGreaterThanOrEqual(0);
          expect(currentPower).toBeLessThanOrEqual(maxPower);
          if (power.has(target)) expect(currentPower).toBe(power.get(target));
          power.set(target, currentPower);
          if (target === anfrony && time === 24_000) anfronyAt24 = current / max;
        }
      } else if (code === "k") {
        deaths.set(guid(Number(row[3])), Number(time));
      }
    }
    // A previous rolling-window health formula left most of the raid at 1 HP.
    for (const row of rows) {
      if (row[0] !== "r" || row[1] !== 30_000 || !playerIDs.has(guid(Number(row[2])))) continue;
      expect(Number(row[3]) / Number(row[4])).toBeGreaterThan(0.2);
    }
    // The cinematic rotation should read like a raid, not a handful of weak hits.
    expect(playerDamage).toBeGreaterThan(100_000);
    expect(playerHealing).toBeGreaterThan(0);
    expect(manaSpent).toBeGreaterThan(0);
    // The recorder's party frame is visibly around half health at video 1:48.
    expect(anfronyAt24).toBeGreaterThan(0.35);
    expect(anfronyAt24).toBeLessThan(0.65);
    for (const [target, deadAt] of deaths) {
      expect(rows.some((row) => row[0] === "d" && guid(Number(row[2])) === target && Number(row[1]) > deadAt)).toBe(false);
    }
  });

  it("selects the five players when asked", () => {
    const { props } = loadMapFixture(kreshReal, { selectPlayers: true });
    expect(props.context.entitySelection.playerIds.size).toBe(5);
  });
});
