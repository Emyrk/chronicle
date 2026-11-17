import { describe, expect, it } from "vitest";
import { CelParseError, lineCol, parseCEL } from "./celParser";
import { EXAMPLES } from "./examples";
import { emptyForm, formToTree, formatCEL, type Node } from "./queryModel";

describe("parseCEL", () => {
  it("round-trips every example through formatCEL", () => {
    for (const ex of EXAMPLES) {
      expect(parseCEL(formatCEL(ex.where)), ex.id).toEqual(ex.where);
    }
  });

  it("round-trips the form's output", () => {
    const tree = formToTree({
      ...emptyForm(),
      zone: "molten",
      from: "2026-10-01",
      to: "2026-10-31",
      killed: ["Ragnaros"],
      noWipes: ["Majordomo Executus"],
      parseScope: "realm",
      clearParseMin: 90,
      killParseMin: 80,
      killParseBosses: ["Ragnaros", "Majordomo Executus"],
      killParseMatch: "each",
      idleTimeMaxSeconds: 5,
      classCounts: [{ class: "DRUID", spec: "Feral", subSpec: "Bear", min: 2 }],
      players: ["Ëlune"],
      guildCounts: [{ guild: "Beta", min: 10 }],
      capabilities: ["unit-position"],
    });
    expect(parseCEL(formatCEL(tree))).toEqual(tree);
  });

  it("reads hand-written queries", () => {
    expect(parseCEL(`instance.name == "Molten Core"`)).toEqual({ field: "instance.name", op: "=", value: "Molten Core" });
    expect(parseCEL(`players.exists(x, x.class == "MAGE")`)).toEqual({ any_player: { field: "player.class", op: "=", value: "MAGE" } });
    expect(parseCEL(`players.size() > 30 || instance.player_count <= 20`)).toEqual({
      or: [{ count_players: { op: ">", value: 30 } }, { field: "instance.player_count", op: "<=", value: 20 }],
    });
    expect(parseCEL(`!(instance.guild in ["A", "B"])`)).toEqual({ field: "instance.guild", op: "not_in", value: ["A", "B"] });
    expect(parseCEL(`!instance.capabilities.exists(c, c in ["interrupt"])`)).toEqual({ field: "instance.capability", op: "not_in", value: ["interrupt"] });
    expect(parseCEL(`!("server-side" in instance.capabilities)`)).toEqual({ field: "instance.capability", op: "!=", value: "server-side" });
    expect(parseCEL("")).toBeUndefined();
    expect(parseCEL("  true ")).toBeUndefined();
  });

  it("flattens chains and respects parentheses", () => {
    const n = parseCEL(`instance.a == 1 && (instance.b == 2 || instance.c == 3) && instance.d == 4`) as Node;
    expect(n.and).toHaveLength(3);
    expect(n.and?.[1].or).toHaveLength(2);
  });

  it("reports errors with a position", () => {
    const cases: [string, RegExp][] = [
      [`instance.name ==`, /Expected a value/],
      [`p.class == "MAGE"`, /Unknown name "p"/],
      [`players.exists(p, players.exists(q, q.name == "x"))`, /other quantifier nesting/],
      [`instance.name == "unterminated`, /Unterminated string/],
      [`instance.name.endsWith("x")`, /Unknown method "endsWith"/],
      [`instance.kill_time_ms({"boss": ["Rag"]}) > 0`, /Unknown option "boss"/],
      [`instance.name == "a" instance.realm == "b"`, /Unexpected text/],
    ];
    for (const [src, re] of cases) {
      let err: unknown;
      try {
        parseCEL(src);
      } catch (e) {
        err = e;
      }
      expect(err, src).toBeInstanceOf(CelParseError);
      expect((err as Error).message, src).toMatch(re);
    }
  });

  it("maps offsets to line and column", () => {
    expect(lineCol("ab\ncd", 4)).toEqual({ line: 2, col: 2 });
  });
});

it("round-trips encounter-scoped player quantifiers with local collections", () => {
  const sources = [
    'encounters.exists(e, e.name == "Hodir" && e.players.exists(p, p.class == "PRIEST"))',
    'encounters.filter(e, e.players.filter(p, p.dps >= 1000).size() >= 3).size() >= 2',
    'encounters.exists(e, e.players.size() == 0)',
    'encounters.exists(pull, pull.players.exists(player, player.name == "Alice"))',
  ];
  for (const source of sources) {
    const tree = parseCEL(source);
    expect(formatCEL(tree)).toContain("e.players.");
    expect(parseCEL(formatCEL(tree))).toEqual(tree);
  }
});
it.each([
  'encounters.exists(e, players.exists(p, p.class == "PRIEST"))',
  'players.exists(p, encounters.exists(e, e.killed == true))',
  'encounters.exists(e, e.players.exists(p, players.size() > 0))',
])("rejects invalid quantifier nesting: %s", (source) => {
  expect(() => parseCEL(source)).toThrow(CelParseError);
});
