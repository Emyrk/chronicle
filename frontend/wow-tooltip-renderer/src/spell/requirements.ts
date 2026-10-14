import type { WoWSpell } from "../types.js";
import { getEnglishText } from "../shared/localization.js";
import {
  SPELL_TOOLTIP_CONTEXT_VARIABLES,
  type SpellTooltipNumericContextField,
} from "./context.js";
import { parseDescriptionVariables } from "./descriptionVariables.js";

export interface SpellTooltipRequirements {
  numericContextFields: SpellTooltipNumericContextField[];
  usesGender: boolean;
  conditionalSpellIds: number[];
  conditionalAuraIds: number[];
  referencedSpellIds: number[];
  descriptionVariables: string[];
  unsupportedVariables: string[];
}

const STANDARD_LOCAL_VARIABLES = new Set([
  "s",
  "m",
  "M",
  "o",
  "d",
  "t",
  "a",
  "e",
  "x",
  "b",
  "f",
  "h",
  "n",
  "r",
  "u",
  "v",
  "i",
  "z",
  "c",
  "l",
  "g",
  "bc",
  "w",
]);

/** Identify the external character and spell context used by a spell tooltip. */
export function getSpellTooltipRequirements(
  spell: WoWSpell,
  templates: readonly string[] = [
    getEnglishText(spell.description),
    getEnglishText(spell.aura_description),
  ],
): SpellTooltipRequirements {
  const descVars = parseDescriptionVariables(spell.description_variables);
  const pending = [...templates];
  const visitedDescVars = new Set<string>();
  const numericFields = new Set<SpellTooltipNumericContextField>();
  const conditionalSpellIds = new Set<number>();
  const conditionalAuraIds = new Set<number>();
  const referencedSpellIds = new Set<number>();
  const unsupportedVariables = new Set<string>();
  let usesGender = false;

  for (let cursor = 0; cursor < pending.length; cursor++) {
    const text = pending[cursor] ?? "";

    for (const match of text.matchAll(/\$<([a-zA-Z_][a-zA-Z0-9_]*)>/g)) {
      const name = match[1];
      if (visitedDescVars.has(name)) continue;
      visitedDescVars.add(name);
      const expression = descVars.get(name);
      if (expression !== undefined) pending.push(expression);
    }

    for (const match of text.matchAll(/\$\?s(\d+)/g)) {
      conditionalSpellIds.add(Number(match[1]));
    }
    for (const match of text.matchAll(/\$\?a(\d+)/g)) {
      conditionalAuraIds.add(Number(match[1]));
    }

    for (const match of text.matchAll(/\$(\d+)[a-zA-Z](?:\d+)?/g)) {
      referencedSpellIds.add(Number(match[1]));
    }
    for (const match of text.matchAll(/\$[*/]\d+;(\d+)[a-zA-Z](?:\d+)?/g)) {
      referencedSpellIds.add(Number(match[1]));
    }

    if (/\$g[^:]+:[^;]+;/i.test(text)) usesGender = true;

    for (const match of text.matchAll(/\$([a-zA-Z]+)(?:\d+)?/g)) {
      const token = match[1];
      const end = (match.index ?? 0) + match[0].length;
      if (token[0]?.toLowerCase() === "g" && text[end] === ":") continue;
      const field = SPELL_TOOLTIP_CONTEXT_VARIABLES[token.toUpperCase()];
      if (field) {
        numericFields.add(field);
      } else if (!STANDARD_LOCAL_VARIABLES.has(token)) {
        unsupportedVariables.add(`$${token}`);
      }
    }
  }

  for (const id of conditionalSpellIds) referencedSpellIds.add(id);

  return {
    numericContextFields: [...numericFields],
    usesGender,
    conditionalSpellIds: [...conditionalSpellIds].sort((a, b) => a - b),
    conditionalAuraIds: [...conditionalAuraIds].sort((a, b) => a - b),
    referencedSpellIds: [...referencedSpellIds].sort((a, b) => a - b),
    descriptionVariables: [...visitedDescVars],
    unsupportedVariables: [...unsupportedVariables].sort(),
  };
}
