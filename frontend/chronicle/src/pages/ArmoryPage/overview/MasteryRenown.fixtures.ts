import { calculateMastery, calculateRenown, renownTitle, type MasteryInputs } from "./masteryRenownModel";

export interface MasteryEncounter extends MasteryInputs {
  instanceName: string;
  encounterName: string;
}

export interface MasteryScope {
  id: string;
  name: string;
  bosses: number;
  performance: MasteryInputs;
}

export interface MasteryPlayerFixture {
  id: string;
  name: string;
  playerClass: string;
  specialization: string;
  guild: string;
  realm: string;
  classColor: string;
  archetype: string;
  summary: string;
  kills: number;
  bosses: number;
  raids: number;
  completedRaids: number;
  firstKill: string;
  lastKill: string;
  performance: MasteryInputs;
  featuredEncounter: MasteryEncounter;
  scopes: MasteryScope[];
  distinctions: string[];
}

export interface MasteryPlayer extends MasteryPlayerFixture {
  mastery: ReturnType<typeof calculateMastery>;
  renown: number;
  renownTitle: string;
}

/**
 * Curated from deduplicated OctoWoW / N'Zoth DPS parse results for the 180 days ending
 * October 31, 2026. These are explanatory fixtures, not a production rating or endorsement.
 */
const OCTO_FIXTURES: MasteryPlayerFixture[] = [
  {
    id: "port",
    name: "Port",
    playerClass: "Shaman",
    specialization: "Enhancement",
    guild: "nope",
    realm: "N'Zoth",
    classColor: "#0070de",
    archetype: "The proven ace",
    summary: "The peak is real, the floor is high, and hundreds of kills keep the evidence bar full.",
    kills: 247,
    bosses: 30,
    raids: 4,
    completedRaids: 3,
    firstKill: "Jul 23",
    lastKill: "Oct 30",
    performance: { peak: 100, form: 94.3, floor: 83.6, kills: 247 / 30 },
    featuredEncounter: {
      instanceName: "Molten Core",
      encounterName: "Ragnaros",
      peak: 99.7,
      form: 97.7,
      floor: 95.3,
      kills: 14,
    },
    scopes: [
      { id: "molten-core", name: "Molten Core", bosses: 12, performance: { peak: 100, form: 93.6, floor: 83.1, kills: 14 } },
      { id: "onyxia", name: "Onyxia's Lair", bosses: 2, performance: { peak: 100, form: 97, floor: 92.9, kills: 18 } },
      { id: "zulgurub", name: "Zul'Gurub", bosses: 11, performance: { peak: 100, form: 95.2, floor: 76.5, kills: 4 } },
      { id: "lower-karazhan", name: "Lower Karazhan", bosses: 5, performance: { peak: 98.8, form: 88, floor: 86.4, kills: 2 } },
    ],
    distinctions: ["30 bosses witnessed", "14 Ragnaros kills", "95.3 reliable floor"],
  },
  {
    id: "lebron",
    name: "Lebron",
    playerClass: "Mage",
    specialization: "Arcane",
    guild: "strawberry fields",
    realm: "N'Zoth",
    classColor: "#3fc7eb",
    archetype: "The complete portfolio",
    summary: "Broad, repeated excellence. Not every night is perfect, but almost every boss has a deep record.",
    kills: 360,
    bosses: 31,
    raids: 4,
    completedRaids: 4,
    firstKill: "Jul 28",
    lastKill: "Oct 31",
    performance: { peak: 100, form: 88.9, floor: 75.7, kills: 360 / 31 },
    featuredEncounter: {
      instanceName: "Molten Core",
      encounterName: "Lucifron",
      peak: 100,
      form: 96.8,
      floor: 89.7,
      kills: 14,
    },
    scopes: [
      { id: "molten-core", name: "Molten Core", bosses: 12, performance: { peak: 100, form: 92.9, floor: 85.4, kills: 14 } },
      { id: "onyxia", name: "Onyxia's Lair", bosses: 2, performance: { peak: 100, form: 89.6, floor: 73.4, kills: 19 } },
      { id: "zulgurub", name: "Zul'Gurub", bosses: 12, performance: { peak: 100, form: 88.5, floor: 74.2, kills: 10 } },
      { id: "lower-karazhan", name: "Lower Karazhan", bosses: 5, performance: { peak: 100, form: 87.3, floor: 71.6, kills: 13 } },
    ],
    distinctions: ["31 bosses witnessed", "360 scored kills", "four complete raid ledgers"],
  },
  {
    id: "jinocide",
    name: "Jinocide",
    playerClass: "Warrior",
    specialization: "Fury",
    guild: "Smokey Tokers",
    realm: "N'Zoth",
    classColor: "#c69b6d",
    archetype: "The dangerous spark",
    summary: "Capable of a spectacular ceiling, but the body of work still tells a volatile story.",
    kills: 211,
    bosses: 31,
    raids: 4,
    completedRaids: 4,
    firstKill: "Jul 26",
    lastKill: "Oct 30",
    performance: { peak: 99.1, form: 45.1, floor: 28.5, kills: 211 / 31 },
    featuredEncounter: {
      instanceName: "Zul'Gurub",
      encounterName: "High Priestess Arlokk",
      peak: 98.2,
      form: 30.6,
      floor: 22.5,
      kills: 5,
    },
    scopes: [
      { id: "molten-core", name: "Molten Core", bosses: 12, performance: { peak: 87.4, form: 38.5, floor: 24.2, kills: 9 } },
      { id: "onyxia", name: "Onyxia's Lair", bosses: 2, performance: { peak: 76.2, form: 38.9, floor: 25.9, kills: 10 } },
      { id: "zulgurub", name: "Zul'Gurub", bosses: 12, performance: { peak: 99.1, form: 62.9, floor: 37.9, kills: 6 } },
      { id: "lower-karazhan", name: "Lower Karazhan", bosses: 5, performance: { peak: 96.2, form: 46.4, floor: 27.9, kills: 6 } },
    ],
    distinctions: ["99.1 peak parse", "31 bosses attempted", "high-variance specialist"],
  },
  {
    id: "rave",
    name: "Rave",
    playerClass: "Warrior",
    specialization: "Protection",
    guild: "Ninja Turtles",
    realm: "N'Zoth",
    classColor: "#c69b6d",
    archetype: "The perfect flash",
    summary: "One perfect result earns attention—not mastery. Chronicle keeps the promise visibly provisional.",
    kills: 1,
    bosses: 1,
    raids: 1,
    completedRaids: 0,
    firstKill: "Oct 8",
    lastKill: "Oct 8",
    performance: { peak: 100, form: 100, floor: 100, kills: 1 },
    featuredEncounter: {
      instanceName: "Molten Core",
      encounterName: "Incindis",
      peak: 100,
      form: 100,
      floor: 100,
      kills: 1,
    },
    scopes: [
      { id: "molten-core", name: "Molten Core", bosses: 1, performance: { peak: 100, form: 100, floor: 100, kills: 1 } },
    ],
    distinctions: ["one #1-relative parse", "one boss witnessed", "provisional evidence"],
  },
];

export const MASTERY_PLAYERS: MasteryPlayer[] = OCTO_FIXTURES.map((player) => {
  const mastery = calculateMastery(player.performance);
  const renown = calculateRenown({
    kills: player.kills,
    bosses: player.bosses,
    completedRaids: player.completedRaids,
  });

  return {
    ...player,
    mastery,
    renown,
    renownTitle: renownTitle(renown),
  };
});
