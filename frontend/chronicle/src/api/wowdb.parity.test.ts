import { describe, it, expect } from "vitest";
// Old (incumbent) resolver, kept in place for comparison during the migration.
import {
  resolveSpellDescription as oldResolve,
  extractReferencedSpellIds as oldExtract,
} from "./wowdb";
// New hand-written parser-based resolver from the extracted package.
import {
  resolveSpellDescription as newResolve,
  extractReferencedSpellIds as newExtract,
} from "@chronicle/wow-tooltip-renderer";
import type { WoWSpell } from "@chronicle/wow-tooltip-renderer";
import { testSpells, spells } from "@testdata/spellTestVectors";

// Differential ("parity") test: the new package resolver must produce byte-for-byte
// identical output to the historical resolver across every generated DBC vector
// for the active server. This is the safety net for the regex->parser rewrite.
//
// Run for each server: cd frontend/chronicle && SERVER=<server> pnpm test -- wowdb.parity

const serverName = import.meta.env.VITE_SERVER_NAME ?? "turtle";

function refMapFor(template: string): Map<number, WoWSpell> {
  const refIds = oldExtract(template);
  return new Map(
    refIds
      .filter((rid) => spells[rid])
      .map((rid) => [rid, spells[rid] as unknown as WoWSpell]),
  );
}

describe(`resolver parity (old vs package) [${serverName}]`, () => {
  testSpells.forEach(
    ({ id, name, descriptionTemplate, auraDescriptionTemplate }) => {
      const spell = spells[id];

      for (const [label, template] of [
        ["description", descriptionTemplate],
        ["aura", auraDescriptionTemplate],
      ] as const) {
        if (!template || template === "<empty>") continue;

        it(`spell ${id} (${name}) ${label}`, () => {
          const refMap = refMapFor(template);
          const oldOut = oldResolve(
            spell,
            template,
            refMap as unknown as Map<number, never>,
          );
          const newOut = newResolve(
            spell as unknown as WoWSpell,
            template,
            refMap,
          );
          expect(newOut).toBe(oldOut);
        });
      }
    },
  );
});

describe(`extractReferencedSpellIds parity [${serverName}]`, () => {
  testSpells.forEach(({ id, name, descriptionTemplate, auraDescriptionTemplate }) => {
    for (const [label, template] of [
      ["description", descriptionTemplate],
      ["aura", auraDescriptionTemplate],
    ] as const) {
      if (!template || template === "<empty>") continue;
      it(`spell ${id} (${name}) ${label}`, () => {
        expect(newExtract(template)).toEqual(oldExtract(template));
      });
    }
  });
});
