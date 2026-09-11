import { describe, expect, it } from "vitest";
import type { GuildEncounterKill } from "@/api/typesGenerated";
import { filterCanonicalProgressionEncounters } from "./progressUtils";

const canonicalUlduarBosses = [
  "Flame Leviathan",
  "Ignis the Furnace Master",
  "Razorscale",
  "XT-002 Deconstructor",
  "Assembly of Iron",
  "Kologarn",
  "Auriaya",
  "Hodir",
  "Thorim",
  "Freya",
  "Mimiron",
  "General Vezax",
  "Yogg-Saron",
  "Algalon the Observer",
];

function encounter(name: string): GuildEncounterKill {
  return {
    instance_name: "Ulduar",
    encounter_name: name,
    difficulty_name: "10 Player",
    max_players: 10,
    kills: 1,
    first_killed_at: "2026-09-01T00:00:00Z",
    last_killed_at: "2026-09-01T00:00:00Z",
  };
}

describe("filterCanonicalProgressionEncounters", () => {
  it("keeps the canonical 14 Ulduar bosses and omits optional elders", () => {
    const encounters = [
      ...canonicalUlduarBosses.map(encounter),
      encounter("Elder Brightleaf"),
      encounter("Elder Ironbranch"),
      encounter("Elder Stonebark"),
    ];

    const filtered = filterCanonicalProgressionEncounters(
      encounters,
      new Map([["Ulduar", new Set(canonicalUlduarBosses)]]),
    );

    expect(filtered.map((entry) => entry.encounter_name)).toEqual(canonicalUlduarBosses);
  });

  it("preserves encounters for instances without canonical metadata", () => {
    const encounters = [encounter("Unknown Boss")];

    expect(filterCanonicalProgressionEncounters(encounters, new Map())).toEqual(encounters);
  });
});
