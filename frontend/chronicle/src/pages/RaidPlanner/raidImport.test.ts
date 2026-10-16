import { describe, expect, it } from "vitest";
import type {
  GuildRosterCharacter,
  InstanceRaidGroupResponse,
  WoWAttendanceInstance,
} from "@/api/typesGenerated";
import { buildRaidImport } from "./raidImport";

const instance = {
  id: "instance-1",
  realm_name: "Tel'Abim",
  players: {
    "0x1": { name: "Alice", class: "PRIEST", race: "Human", level: 60 },
    "0x2": { name: "Bob", class: "WARRIOR", race: "Orc", level: 60 },
    "0x3": { name: "Cara", class: "MAGE", race: "Gnome", level: 60 },
  },
} as unknown as WoWAttendanceInstance;

const roster = [
  {
    id: "character-1",
    name: "Alice",
    class: "PRIEST",
    spec: "Holy",
    role: "heal",
    spec_roles: [{ spec: "Holy", role: "heal" }],
    avg_parse: 88,
    level: 60,
    realm_name: "Tel'Abim",
  },
] as unknown as GuildRosterCharacter[];

describe("buildRaidImport", () => {
  it("preserves reported groups, enriches roster matches, and benches ungrouped players", () => {
    const raidGroup = {
      available: true,
      final: {
        observed_at: "2026-10-15T20:00:00Z",
        groups: [
          [
            { guid: "0x1", name: "Alice", class: "PRIEST", spec: "Discipline" },
            { guid: "0x2", name: "Bob", class: "WARRIOR", spec: "Fury" },
          ],
        ],
      },
      clean_kills: [],
    } as InstanceRaidGroupResponse;

    const result = buildRaidImport(instance, raidGroup, roster);

    expect(result.board).toHaveLength(1);
    expect(result.board[0]).toHaveLength(5);
    expect(result.board[0][0]).toMatchObject({
      id: "character-1",
      name: "Alice",
      spec: "Discipline",
      reportedSpec: "Discipline",
      avgParse: 88,
    });
    expect(result.board[0][1]).toMatchObject({
      id: "raid:instance-1:0x2",
      name: "Bob",
      cls: "WARRIOR",
      spec: "Fury",
    });
    expect(result.bench).toEqual([
      expect.objectContaining({ id: "raid:instance-1:0x3", name: "Cara" }),
    ]);
  });

  it("builds five-player groups from attendance when raid-group data is unavailable", () => {
    const result = buildRaidImport(instance, { available: false, clean_kills: [] }, []);

    expect(result.board).toHaveLength(1);
    expect(result.board[0].map((entry) => entry?.kind === "player" ? entry.name : null)).toEqual([
      "Alice",
      "Bob",
      "Cara",
      null,
      null,
    ]);
    expect(result.bench).toEqual([]);
  });
});
