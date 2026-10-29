import { describe, expect, it } from "vitest";
import type { Encounter, Instance } from "@/pages/Instance/InstancePage";
import { deathsFromRecaps, exploreRunFromInstance, fullRunHref, liveHeroRun } from "./explore3D";
import { HERO_PULL_LEAD_MS, heroWindow } from "./heroReplay";

const START = "2026-10-01T20:00:00Z";

function encounter(id: string, boss: boolean, killType: Encounter["kill_type"], startMin: number, endMin: number): Encounter {
  const at = (min: number) => new Date(Date.parse(START) + min * 60_000).toISOString();
  return { id, name: id, boss, mapId: 1, kill_type: killType, start_time: at(startMin), end_time: at(endMin) };
}

function instance(encounters: Encounter[]): Instance {
  return { id: "run-id", slug: "abc", name: "Molten Core", startTime: START, encounters, capabilities: [] } as unknown as Instance;
}

describe("exploreRunFromInstance", () => {
  it("lists boss pulls in order and opens on the last kill", () => {
    const run = exploreRunFromInstance(instance([
      encounter("Golemagg", true, "clean", 30, 33),
      encounter("trash", false, "clean", 1, 2),
      encounter("Lucifron", true, "partial", 5, 8),
      encounter("Ragnaros", true, "wipe", 50, 55),
    ]));
    expect(run.bosses.map((boss) => boss.id)).toEqual(["Lucifron", "Golemagg", "Ragnaros"]);
    expect(run.bosses[0]).toMatchObject({ kill: true, start_offset_ms: 300_000, end_offset_ms: 480_000 });
    expect(run.bosses[2].kill).toBe(false);
    expect(run.encounter?.id).toBe("Golemagg");
    expect(run.duration_ms).toBe(55 * 60_000);
    expect(run.deaths).toEqual([]);
  });

  it("opens on the last boss pull when no boss died, and on nothing without bosses", () => {
    expect(exploreRunFromInstance(instance([encounter("A", true, "wipe", 1, 2), encounter("B", true, "reset", 3, 4)])).encounter?.id).toBe("B");
    expect(exploreRunFromInstance(instance([encounter("trash", false, "clean", 1, 2)])).encounter).toBeNull();
  });
});

describe("deathsFromRecaps", () => {
  it("turns recaps into death dots in time order", () => {
    const recap = { victimClass: "MAGE", killingBlow: null, killingBlowAmount: null, beats: [] };
    expect(deathsFromRecaps([
      { ...recap, offsetMs: 9_000, victimName: "Late", killerName: "Ragnaros" },
      { ...recap, offsetMs: 2_000, victimName: "Early", killerName: null },
    ])).toEqual([
      { offset_ms: 2_000, victim_name: "Early", victim_class: "MAGE" },
      { offset_ms: 9_000, victim_name: "Late", victim_class: "MAGE", killer_name: "Ragnaros" },
    ]);
  });
});

describe("liveHeroRun", () => {
  const recap = { victimClass: "WARRIOR", killerName: null, killingBlow: null, killingBlowAmount: null, beats: [] };

  it("is the payload-less hero's run: its last kill as the pull, the recaps' deaths scoped to that pull", () => {
    const run = liveHeroRun(instance([encounter("Lucifron", true, "clean", 5, 8), encounter("Golemagg", true, "clean", 30, 33)]), [
      { ...recap, offsetMs: 6 * 60_000, victimName: "Early" },
      { ...recap, offsetMs: 31 * 60_000, victimName: "Tank", killerName: "Golemagg" },
    ]);
    expect(run.deaths.map((death) => death.victim_name)).toEqual(["Early", "Tank"]);

    const hero = heroWindow(run);
    const startOffsetMs = 30 * 60_000 - HERO_PULL_LEAD_MS;
    expect(hero.window).toEqual({ encounterId: "Golemagg", startOffsetMs, endOffsetMs: 33 * 60_000 });
    expect(hero.run.bosses).toEqual([{ id: "Golemagg", name: "Golemagg", kill: true, start_offset_ms: HERO_PULL_LEAD_MS, end_offset_ms: 33 * 60_000 - startOffsetMs }]);
    expect(hero.run.deaths).toEqual([{ offset_ms: 31 * 60_000 - startOffsetMs, victim_name: "Tank", victim_class: "WARRIOR", killer_name: "Golemagg" }]);
    // The boss rail picks another pull of the same run.
    expect(heroWindow(run, "Lucifron").run.deaths.map((death) => death.victim_name)).toEqual(["Early"]);
  });

  it("has no deaths until they are processed", () => {
    expect(liveHeroRun(instance([encounter("A", true, "clean", 1, 2)]), null).deaths).toEqual([]);
  });
});

describe("fullRunHref", () => {
  it("opens the run page's Watch preset by slug, else by id", () => {
    expect(fullRunHref({ id: "run-id", slug: "abc" })).toBe("/instances/abc?preset=watch");
    expect(fullRunHref({ id: "run-id" })).toBe("/instances/run-id?preset=watch");
  });
});
