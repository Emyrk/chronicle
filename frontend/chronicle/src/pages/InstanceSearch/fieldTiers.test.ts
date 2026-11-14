import { describe, expect, it } from "vitest";
import type { InstanceSearchFieldsResponse } from "@/api/typesGenerated";
import fixture from "./fixtures/searchFields.json";
import { HONORED_FIELDS, fieldLock, treeNeedsHonored, treeNeedsRevered } from "./fieldTiers";
import { KINDS } from "./sentenceKinds";
import { emptyForm, formToTree, type SearchForm } from "./queryModel";

const desc = fixture as unknown as InstanceSearchFieldsResponse;
const field = (name: string) => desc.fields.find((f) => f.name === name)!;

describe("fieldTiers", () => {
  it("names real fields", () => {
    for (const name of HONORED_FIELDS) expect(desc.fields.some((f) => f.name === name), name).toBe(true);
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
      bossTime: { bossTimeMaxSeconds: 10 },
      trashTime: { trashTimeMaxSeconds: 10 },
      idleTime: { idleTimeMaxSeconds: 10 },
      clearTime: { clearTimeMaxSeconds: 10 },
      clearParse: { clearParseMin: 90 },
      killParse: { killParseMin: 90 },
      classCount: { classCounts: [{ class: "MAGE", spec: "", subSpec: "", min: 1 }] },
      bossKillTime: { bossKillTimes: [{ boss: "Ragnaros", maxSeconds: 2 }] },
    };
    for (const [kind, sample] of Object.entries(samples)) {
      const def = KINDS.find((k) => k.kind === kind)!;
      expect(treeNeedsHonored(formToTree({ ...emptyForm(), ...sample })), kind).toBe(def.tier === "honored");
    }
  });
});

it.each(["", "honored", "revered", "exalted"])("requires Revered for hostile count at tier %s", (tier) => {
  const revered = tier === "revered" || tier === "exalted";
  expect(fieldLock(field("encounter.hostile_count"), { loggedIn: true, honored: tier !== "", revered })).toBe(revered ? null : "revered");
  expect(fieldLock(field("instance.name"), { loggedIn: true, revered })).toBeNull();
  expect(field("encounter.hostile_count").cost).toBe(40);
});
it("finds restricted fields in shared nested queries and fails closed while loading", () => {
  const predicate = { field: "encounter.hostile_count", op: ">=" as const, value: 3 };
  expect(fieldLock(field("encounter.hostile_count"), {})).toBe("revered");
  expect(treeNeedsRevered({ not: { or: [{ count_encounters: { where: predicate, op: ">=", value: 1 } }] } })).toBe(true);
  expect(treeNeedsRevered({ any_encounter: predicate })).toBe(true);
  expect(treeNeedsRevered({ field: "player.dps", op: ">", value: 1 })).toBe(false);
});
