import { describe, expect, it } from "vitest";
import {
  decodeSpellSearch,
  encodeSpellSearch,
  prepareSpellSearch,
  type SpellSearchDraft,
} from "./spellSearchModel";

const draft: SpellSearchDraft = {
  context: { level: 60, difficulty: 2 },
  where: {
    and: [
      { field: "spell.name", op: "contains", value: "Éclair" },
      { any_effect: { and: [{ field: "effect.type", op: "=", value: "School damage" }] } },
    ],
  },
};

describe("spell search model", () => {
  it("round trips Unicode through a base64url parameter", () => {
    const encoded = encodeSpellSearch(draft);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeSpellSearch(encoded)).toEqual(draft);
  });

  it("rejects malformed values", () => {
    expect(decodeSpellSearch(null)).toBeUndefined();
    expect(decodeSpellSearch("not-base64!!")).toBeUndefined();
  });

  it("prunes incomplete predicates and empty groups", () => {
    expect(prepareSpellSearch({
      context: { level: 59.7, difficulty: -2 },
      where: {
        and: [
          { field: "spell.name", op: "contains", value: "" },
          { field: "spell.id", op: ">=", value: 100 },
          { any_power: { and: [] } },
        ],
      },
    })).toEqual({
      context: { level: 60, difficulty: 0 },
      where: { and: [{ field: "spell.id", op: ">=", value: 100 }] },
    });
  });

  it("does not submit an empty editor", () => {
    expect(prepareSpellSearch({ context: { level: null, difficulty: 0 }, where: { and: [] } })).toBeUndefined();
  });
});
