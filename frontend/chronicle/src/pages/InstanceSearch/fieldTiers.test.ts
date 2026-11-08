import { describe, expect, it } from "vitest";
import type { InstanceSearchFieldsResponse } from "@/api/typesGenerated";
import fixture from "./fixtures/searchFields.json";
import { fieldLock, honoredFields, treeNeedsHonored as needsHonored } from "./fieldTiers";
import { KINDS } from "./sentenceKinds";
import { emptyForm, formToTree, type SearchForm } from "./queryModel";

const desc = fixture as unknown as InstanceSearchFieldsResponse;
const field = (name: string) => desc.fields.find((f) => f.name === name)!;
const honored = honoredFields(desc.fields);
const treeNeedsHonored = (n: Parameters<typeof needsHonored>[0]) => needsHonored(n, honored);

describe("fieldTiers", () => {
  it("reads the Honored fields from minimum_tier", () => {
    expect([...honored].sort()).toEqual([
      "instance.boss_time_ms",
      "instance.idle_time_ms",
      "instance.trash_time_ms",
      "player.avg_ilvl",
      "player.dps",
      "player.hps",
      "player.parse",
    ]);
  });

  it("locks by tier", () => {
    expect(fieldLock(field("player.parse"), { honored: false, loggedIn: true })).toBe("honored");
    expect(fieldLock(field("player.parse"), { honored: true, loggedIn: true })).toBeNull();
    expect(fieldLock(field("player.class"), { honored: false, loggedIn: true })).toBeNull();
    expect(fieldLock(field("player.class"), { honored: false, loggedIn: false })).toBe("login");
    expect(fieldLock(field("instance.name"), { honored: false, loggedIn: false })).toBeNull();
    // Unknown access (still loading) is allowed.
    expect(fieldLock(field("player.parse"), {})).toBeNull();
  });

  it("finds Honored fields anywhere in a tree", () => {
    expect(treeNeedsHonored({ and: [{ field: "instance.name", op: "=", value: "x" }] })).toBe(false);
    expect(treeNeedsHonored({ not: { any_player: { or: [{ field: "player.class", op: "=", value: "MAGE" }, { field: "player.dps", op: ">=", value: 1 }] } } })).toBe(true);
    expect(treeNeedsHonored({ count_players: { where: { field: "player.parse", op: ">=", value: 1 }, op: ">=", value: 1 } })).toBe(true);
  });

  it("matches the sentence form's Honored conditions", () => {
    // Each sentence condition is Honored exactly when its query uses an Honored field.
    const samples: Partial<Record<string, Partial<SearchForm>>> = {
      playerParse: { playerParses: [{ name: "", class: "", spec: "", subSpec: "", min: 90, metric: "dps", bosses: [] }] },
      playerStat: { playerStats: [{ name: "", stat: "dps", min: 1, bosses: [] }] },
      bossTime: { bossTimeMaxMinutes: 10 },
      trashTime: { trashTimeMaxMinutes: 10 },
      idleTime: { idleTimeMaxMinutes: 10 },
      clearTime: { clearTimeMaxMinutes: 10 },
      clearParse: { clearParseMin: 90 },
      killParse: { killParseMin: 90 },
      classCount: { classCounts: [{ class: "MAGE", spec: "", subSpec: "", min: 1 }] },
      bossKillTime: { bossKillTimes: [{ boss: "Ragnaros", maxMinutes: 2 }] },
    };
    for (const [kind, sample] of Object.entries(samples)) {
      const def = KINDS.find((k) => k.kind === kind)!;
      expect(treeNeedsHonored(formToTree({ ...emptyForm(), ...sample })), kind).toBe(def.tier === "honored");
    }
  });
});
