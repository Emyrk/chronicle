import { describe, expect, it } from "vitest";
import {
  buildQuery,
  decodeQuery,
  emptyForm,
  encodeQuery,
  formIsBasic,
  formToTree,
  formatCEL,
  prune,
  treeToForm,
  type Node,
  type SearchForm,
} from "./queryModel";

function fullForm(): SearchForm {
  return {
    ...emptyForm(),
    zone: "molten",
    zoneMatch: "contains",
    realm: "Nordanaar",
    guild: "Alpha",
    guildMatch: "exact",
    from: "2026-10-01",
    to: "2026-10-31",
    difficulty: "40 Player",
    killed: ["Ragnaros"],
    noWipes: ["Ragnaros", "Majordomo Executus"],
    parseScope: "realm",
    clearParseMin: 90,
    killParseMin: 80,
    killParseBosses: ["Ragnaros", "Majordomo Executus"],
    killParseMatch: "each",
    clearTimeMaxMinutes: 60,
    idleTimeMaxMinutes: 5,
    classCounts: [
      { class: "PRIEST", spec: "", subSpec: "", min: 3 },
      { class: "PALADIN", spec: "Holy", subSpec: "", min: 2 },
      { class: "DRUID", spec: "Feral", subSpec: "Bear", min: 1 },
    ],
    players: ["Thrall"],
    guildCounts: [{ guild: "Beta", min: 10 }],
    capabilities: ["unit-position", "unit-resources"],
  };
}

describe("formToTree / treeToForm", () => {
  it("round-trips every form field", () => {
    const form = fullForm();
    const tree = formToTree(form);
    expect(tree).toBeDefined();
    expect(treeToForm(tree)).toEqual(form);
  });

  it("round-trips the empty form", () => {
    expect(formToTree(emptyForm())).toBeUndefined();
    expect(treeToForm(undefined)).toEqual(emptyForm());
  });

  it("makes the date range inclusive of the end day", () => {
    const tree = formToTree({ ...emptyForm(), from: "2026-10-01", to: "2026-10-31" });
    expect(tree?.and).toEqual([
      { field: "instance.started_at", op: ">=", value: "2026-10-01T00:00:00Z" },
      { field: "instance.started_at", op: "<", value: "2026-11-01T00:00:00Z" },
    ]);
  });

  it("builds the same-player class + spec count", () => {
    const tree = formToTree({ ...emptyForm(), classCounts: [{ class: "PALADIN", spec: "Holy", subSpec: "", min: 2 }] });
    expect(tree?.and?.[0]).toEqual({
      count_players: {
        where: { and: [{ field: "player.class", op: "=", value: "PALADIN" }, { field: "player.spec", op: "=", value: "Holy" }] },
        op: ">=",
        value: 2,
      },
    });
  });

  it("builds class > spec > sub-spec on the same player", () => {
    const tree = formToTree({ ...emptyForm(), classCounts: [{ class: "DRUID", spec: "Feral", subSpec: "Bear", min: 2 }] });
    expect(tree?.and?.[0]).toEqual({
      count_players: {
        where: {
          and: [
            { field: "player.class", op: "=", value: "DRUID" },
            { field: "player.spec", op: "=", value: "Feral" },
            { field: "player.sub_spec", op: "=", value: "Bear" },
          ],
        },
        op: ">=",
        value: 2,
      },
    });
    // Spec alone (any class) also round-trips.
    const specOnly = { ...emptyForm(), classCounts: [{ class: "", spec: "Holy", subSpec: "", min: 3 }] };
    expect(treeToForm(formToTree(specOnly))).toEqual(specOnly);
    // Out-of-order conditions are not a form shape.
    expect(
      treeToForm({
        and: [{ count_players: { where: { and: [{ field: "player.spec", op: "=", value: "Holy" }, { field: "player.class", op: "=", value: "PRIEST" }] }, op: ">=", value: 1 } }],
      }),
    ).toBeNull();
  });

  it("returns null for trees the form cannot show", () => {
    const or: Node = { or: [{ field: "instance.name", op: "=", value: "a" }, { field: "instance.name", op: "=", value: "b" }] };
    expect(treeToForm(or)).toBeNull();
    expect(treeToForm({ and: [{ any_player: { field: "player.parse", op: ">=", value: 90 } }] })).toBeNull();
    // Two zone filters can't both fit in the single zone box.
    expect(treeToForm({ and: [{ field: "instance.name", op: "=", value: "a" }, { field: "instance.name", op: "=", value: "b" }] })).toBeNull();
  });

  it("accepts a single top-level predicate", () => {
    expect(treeToForm({ field: "instance.realm", op: "=", value: "Nordanaar" })?.realm).toBe("Nordanaar");
  });

  it("knows which forms the anonymous tier allows", () => {
    expect(formIsBasic({ ...emptyForm(), zone: "mc", realm: "x", from: "2026-01-01" })).toBe(true);
    expect(formIsBasic({ ...emptyForm(), killed: ["Ragnaros"] })).toBe(false);
    expect(formIsBasic({ ...emptyForm(), capabilities: ["unit-position"] })).toBe(false);
  });
});

describe("prune", () => {
  it("drops incomplete parts and empty groups", () => {
    const tree: Node = {
      and: [
        { field: "instance.name", op: "=", value: "" },
        { or: [] },
        { any_player: { and: [] } },
        { count_players: { where: { and: [] }, op: ">=", value: 3 } },
        { not: { field: "instance.realm", op: "=", value: "x" } },
      ],
    };
    expect(prune(tree)).toEqual({
      and: [{ count_players: { op: ">=", value: 3 } }, { not: { field: "instance.realm", op: "=", value: "x" } }],
    });
    expect(prune({ and: [{ field: "instance.name", op: "=", value: " " }] })).toBeUndefined();
    expect(buildQuery({ and: [] })).toEqual({});
  });
});

describe("URL encoding", () => {
  it("round-trips non-ASCII values", () => {
    const tree: Node = { any_player: { field: "player.name", op: "=", value: "Ëlune's Lë" } };
    const encoded = encodeQuery(tree);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeQuery(encoded)).toEqual(tree);
  });

  it("ignores garbage", () => {
    expect(decodeQuery("not-base64!!")).toBeUndefined();
    expect(decodeQuery(null)).toBeUndefined();
  });
});

describe("formatCEL", () => {
  it("matches the Go formatter's style", () => {
    const tree: Node = {
      and: [
        { field: "instance.name", op: "contains", value: "molten" },
        { or: [{ field: "instance.clear_parse", op: ">=", value: 95 }, { field: "instance.kill_time_parse", op: ">=", value: 90, bosses: ["Ragnaros"], match: "each" }] },
        { any_player: { and: [{ field: "player.sub_spec", op: "=", value: "Bear", on: "trash" }, { field: "player.sub_spec", op: "=", value: "Cat" }] } },
        { count_players: { where: { field: "player.class", op: "=", value: "PRIEST" }, op: ">=", value: 3 } },
        { field: "instance.capability", op: "=", value: "unit-position" },
      ],
    };
    expect(formatCEL(tree)).toBe(
      [
        `instance.name.contains("molten")`,
        `&& (instance.clear_parse >= 95 || instance.kill_time_parse({"bosses": ["Ragnaros"], "match": "each"}) >= 90)`,
        `&& players.exists(p, p.sub_spec({"on": "trash"}) == "Bear" && p.sub_spec == "Cat")`,
        `&& players.filter(p, p.class == "PRIEST").size() >= 3`,
        `&& "unit-position" in instance.capabilities`,
      ].join("\n"),
    );
  });
});
