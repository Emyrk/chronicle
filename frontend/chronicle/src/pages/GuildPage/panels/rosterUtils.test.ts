import { describe, expect, it } from "vitest";
import type { GuildRosterCharacter } from "@/api/typesGenerated";
import { filterRosterMembers, paginateRosterMembers, sortRosterMembers } from "./rosterUtils";

function member(
  name: string,
  characterClass: string,
  avgParse: number,
  level = 60,
  lastSeenAt = "2026-09-01T00:00:00Z",
): GuildRosterCharacter {
  return {
    id: name,
    name,
    class: characterClass,
    race: "Human",
    level,
    avg_parse: avgParse,
    last_seen_at: lastSeenAt,
    realm_name: "Tel'Abim",
  };
}

const members = [
  member("Zed", "WARRIOR", 90),
  member("Alice", "PRIEST", 80),
  member("Beth", "PRIEST", 70),
];

describe("roster panel helpers", () => {
  it("filters members by class and clears the filter with null", () => {
    expect(filterRosterMembers(members, "PRIEST").map((candidate) => candidate.name))
      .toEqual(["Alice", "Beth"]);
    expect(filterRosterMembers(members, null)).toEqual(members);
  });

  it("sorts a copied roster without mutating server parse order", () => {
    expect(sortRosterMembers(members, "name").map((candidate) => candidate.name))
      .toEqual(["Alice", "Beth", "Zed"]);
    expect(sortRosterMembers(members, "parse")).toEqual(members);
    expect(members.map((candidate) => candidate.name)).toEqual(["Zed", "Alice", "Beth"]);
  });

  it("paginates members and clamps pages after filtering", () => {
    const firstPage = paginateRosterMembers(members, 0, 2);
    expect(firstPage.members.map((candidate) => candidate.name)).toEqual(["Zed", "Alice"]);
    expect(firstPage).toMatchObject({ page: 0, totalPages: 2, start: 0, end: 2 });

    const clampedPage = paginateRosterMembers(members.slice(0, 1), 4, 2);
    expect(clampedPage.members.map((candidate) => candidate.name)).toEqual(["Zed"]);
    expect(clampedPage).toMatchObject({ page: 0, totalPages: 1, start: 0, end: 1 });
  });
});
