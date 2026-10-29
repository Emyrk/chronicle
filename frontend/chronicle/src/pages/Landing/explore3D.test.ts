import { describe, expect, it } from "vitest";
import type { Encounter, Instance } from "@/pages/Instance/InstancePage";
import { deathsFromRecaps, exploreRunFromInstance, fullRunHref } from "./explore3D";

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

  it("drops near-zero duplicate boss pulls", () => {
    const run = exploreRunFromInstance(instance([
      encounter("Bjork", true, "clean", 10, 11),
      encounter("Rath'mael", true, "clean", 20, 20.5),
      { ...encounter("Rath'mael dup", true, "clean", 25, 25), end_time: new Date(Date.parse(START) + 25 * 60_000 + 15).toISOString() },
    ]));
    expect(run.bosses.map((boss) => boss.id)).toEqual(["Bjork", "Rath'mael"]);
    expect(run.encounter?.id).toBe("Rath'mael");
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

describe("fullRunHref", () => {
  it("opens the run page's Watch preset by slug, else by id", () => {
    expect(fullRunHref({ id: "run-id", slug: "abc" })).toBe("/instances/abc?preset=watch");
    expect(fullRunHref({ id: "run-id" })).toBe("/instances/run-id?preset=watch");
  });
});
