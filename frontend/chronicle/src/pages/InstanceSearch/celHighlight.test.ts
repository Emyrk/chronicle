import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { formatCEL } from "./queryModel";
import { highlightCEL } from "./celHighlight";

const kinds = (src: string) => highlightCEL(src).filter((t) => t.kind !== "space").map((t) => `${t.kind}:${t.text}`);

describe("highlightCEL", () => {
  it("colours roots, fields, calls, strings, numbers and operators", () => {
    expect(kinds('players.filter(p, p.class == "PRIEST").size() >= 3')).toEqual([
      "root:players", "punct:.", "call:filter", "punct:(", "field:p", "punct:,", "field:p", "punct:.", "field:class",
      "operator:==", 'string:"PRIEST"', "punct:)", "punct:.", "call:size", "punct:(", "punct:)", "operator:>=", "number:3",
    ]);
  });
  it("treats a root after a dot as a field, and in / true / false as literals", () => {
    expect(kinds('"x" in instance.capabilities && e.killed == true')).toEqual([
      'string:"x"', "literal:in", "root:instance", "punct:.", "field:capabilities", "operator:&&", "field:e", "punct:.",
      "field:killed", "operator:==", "literal:true",
    ]);
  });
  it("never fails on half-typed input", () => {
    expect(kinds('instance.name == "Molt')).toEqual(["root:instance", "punct:.", "field:name", "operator:==", 'string:"Molt']);
    expect(kinds("a @ -5")).toEqual(["field:a", "other:@", "number:-5"]);
  });
  it("covers every character, so the overlay lines up", () => {
    for (const ex of EXAMPLES) {
      const src = formatCEL(ex.where);
      expect(highlightCEL(src).map((t) => t.text).join("")).toBe(src);
    }
  });
});
