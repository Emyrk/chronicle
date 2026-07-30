import type { WoWSpell } from "../types.js";
import { getEnglishText } from "../shared/localization.js";
import {
  formatValue,
  getPeriodicTotal,
  getScaledValue,
} from "./effects.js";
import { resolveVariable } from "./variables.js";
import { evaluateArithmetic } from "./arithmetic.js";

// === WoW Spell Description Template Parser ===
//
// WoW spell descriptions are literal text interleaved with `$`-prefixed escape
// sequences. This is a single left-to-right pass over the template (replacing
// the previous five sequential regex passes). The grammar:
//
//   template = (literal | escape)*
//   escape   = '$' (arithMod | inlineExpr | conditional | crossRef | plural |
//                    gender | descVar | localVar)
//   arithMod = ('*' | '/') DIGITS ';' varRef          -- $*8;s1, $/1000;s1
//   inlineExpr = '{' (literal | escape)* '}'           -- ${$m1*3}, ${5*$AR*0.01}
//   conditional = '?s' DIGITS '[' template ']' '[' template ']'
//                                                         -- $?s123[known][unknown]
//   crossRef = DIGITS varRef                           -- $23455s1  (optionally -$...)
//   plural   = 'l' TEXT ':' TEXT ';'                   -- $lpoint:points;  (lowercase l only)
//   gender   = ('g'|'G') TEXT ':' TEXT ';'             -- $ghe:she;
//   localVar = LETTER DIGIT?                            -- $s1, $d, $n  (optionally -$...)
//   varRef   = LETTER DIGIT?
//
// Notes on fidelity to the historical resolver:
//   - Pluralization picks singular when the most recently emitted number is 1,
//     otherwise plural (default plural when no number has been emitted).
//   - Gender always resolves to the male form (no caster gender at tooltip time).
//   - A '-' immediately before a crossRef/localVar is consumed: numeric results
//     become negative, non-numeric results drop the sign. arithMod and inlineExpr
//     never consume a leading '-'.
//   - Missing cross-referenced spells leave the placeholder intact (visible for
//     diagnosis); a preceding '-' is preserved in that case.
//   - Inline expressions resolve their inner variables first, then evaluate; if
//     evaluation fails the (partially resolved) `${...}` text is kept verbatim.
//   - Spell-known conditionals use the unknown branch because tooltip rendering
//     has no character spellbook context.

// Arithmetic modifiers: $*N;var or $/N;var, with optional cross-spell ref: $/10;23690s1
const RE_ARITH_MUL = /^\$\*(\d+);(\d+)?([a-zA-Z])(\d)?/;
const RE_ARITH_DIV = /^\$\/(\d+);(\d+)?([a-zA-Z])(\d)?/;
const RE_CONDITIONAL = /^\$\?s\d+/;
const RE_CROSSREF = /^\$(\d+)([a-zA-Z])(\d)?/;
const RE_PLURAL = /^\$l([^:]+):([^;]+);/; // lowercase $l only
const RE_GENDER = /^\$g([^:]+):([^;]+);/i; // $g / $G
const RE_DESCVAR = /^\$<([a-zA-Z_][a-zA-Z0-9_]*)>/; // $<total>, $<bonus>, etc.
const RE_LOCALVAR = /^\$([a-zA-Z])(\d)?/;

// Last run of digits in a string, used to update the pluralization anchor.
const RE_LAST_NUMBER = /(\d+)(?![\s\S]*\d)/;

interface ParsedSection {
  content: string;
  end: number;
}

function parseBalancedSection(
  input: string,
  start: number,
  open: string,
  close: string,
): ParsedSection | null {
  if (input[start] !== open) return null;

  let depth = 1;
  for (let i = start + 1; i < input.length; i++) {
    if (input[i] === open) depth++;
    if (input[i] !== close) continue;

    depth--;
    if (depth === 0) {
      return { content: input.slice(start + 1, i), end: i + 1 };
    }
  }

  return null;
}

function parseInlineExpression(input: string): ParsedSection | null {
  if (!input.startsWith("${")) return null;
  return parseBalancedSection(input, 1, "{", "}");
}

interface ParsedConditional {
  whenFalse: string;
  end: number;
}

function parseConditional(input: string): ParsedConditional | null {
  const match = RE_CONDITIONAL.exec(input);
  if (!match) return null;

  const whenTrue = parseBalancedSection(input, match[0].length, "[", "]");
  if (!whenTrue) return null;

  const whenFalse = parseBalancedSection(input, whenTrue.end, "[", "]");
  if (!whenFalse) return null;

  return { whenFalse: whenFalse.content, end: whenFalse.end };
}

function applyArith(
  spell: WoWSpell,
  type: string,
  index: string | undefined,
  lvl: number,
  op: (n: number) => number,
  floating: boolean,
  original: string,
): string {
  const t = type.toLowerCase();
  const idx = index ? parseInt(index, 10) - 1 : 0;
  if (t === "s" || t === "m") {
    return formatValue(getScaledValue(spell, idx, lvl, op), floating);
  }
  if (t === "o") {
    return formatValue(getPeriodicTotal(spell, idx, lvl, op), floating);
  }
  // Fallback: resolve the bare variable as a string, then apply the scalar.
  const variable = `$${type}${index || ""}`;
  const resolved = resolveVariable(spell, variable, lvl);
  const num = Number(resolved);
  if (!isNaN(num)) {
    const out = op(num);
    return Number.isInteger(out)
      ? String(out)
      : out.toFixed(1).replace(/\.0$/, "");
  }
  return original;
}

/**
 * Resolve all template variables in a spell description string.
 *
 * @param spell The spell being described.
 * @param template The template string with $ variables.
 * @param referencedSpells Optional map of spell ID -> WoWSpell for cross-spell references.
 * @param forLevel Optional caster level for scaling (defaults to spell level).
 */
export function resolveSpellDescription(
  spell: WoWSpell,
  template: string,
  referencedSpells?: Map<number, WoWSpell>,
  forLevel?: number,
): string {
  if (!template) return "";

  // Pre-process: parse description_variables to build a name→expression map.
  // Format is "$name=expr\n$name2=expr2\n..." from SpellDescriptionVariables.dbc.
  const descVarMap = parseDescriptionVariables(spell.description_variables);

  const lvl = forLevel ?? spell.spell_level;
  let result = "";
  let lastNumber: number | null = null;

  const append = (s: string) => {
    result += s;
    const m = s.match(RE_LAST_NUMBER);
    if (m) lastNumber = parseInt(m[1], 10);
  };

  // Resolve a numeric/negative variable result, honoring a '-' already emitted
  // immediately before the current escape. Used by crossRef and localVar.
  const appendVar = (resolved: string) => {
    if (result.endsWith("-")) {
      result = result.slice(0, -1); // consume the leading '-'
      const num = Number(resolved);
      if (!isNaN(num)) {
        append(String(-Math.abs(num)));
      } else {
        append(resolved);
      }
    } else {
      append(resolved);
    }
  };

  let i = 0;
  const n = template.length;
  while (i < n) {
    if (template[i] !== "$") {
      append(template[i]);
      i++;
      continue;
    }

    const rest = template.slice(i);
    let m: RegExpExecArray | null;

    // $*N;[spellId]var — multiply (optional cross-spell reference)
    if ((m = RE_ARITH_MUL.exec(rest))) {
      const mult = parseInt(m[1], 10);
      const refSpell = m[2] ? referencedSpells?.get(parseInt(m[2], 10)) : undefined;
      append(
        applyArith(refSpell ?? spell, m[3], m[4], lvl, (x) => x * mult, false, m[0]),
      );
      i += m[0].length;
      continue;
    }

    // $/N;[spellId]var — divide (floating output, optional cross-spell reference)
    if ((m = RE_ARITH_DIV.exec(rest))) {
      const div = parseInt(m[1], 10);
      if (div === 0) {
        append(m[0]); // avoid divide-by-zero; keep placeholder
      } else {
        const refSpell = m[2] ? referencedSpells?.get(parseInt(m[2], 10)) : undefined;
        append(
          applyArith(refSpell ?? spell, m[3], m[4], lvl, (x) => x / div, true, m[0]),
        );
      }
      i += m[0].length;
      continue;
    }

    // $?sNNNN[known][unknown] — runtime spell-known conditional. Tooltip
    // rendering has no character spellbook, so resolve the unknown branch.
    const conditional = parseConditional(rest);
    if (conditional) {
      append(
        resolveSpellDescription(
          spell,
          conditional.whenFalse,
          referencedSpells,
          forLevel,
        ),
      );
      i += conditional.end;
      continue;
    }

    // ${expr} — inline arithmetic (resolve inner variables first, then evaluate).
    // Expressions may contain nested ${...} description-variable expansions.
    const inline = parseInlineExpression(rest);
    if (inline) {
      const inner = resolveSpellDescription(
        spell,
        inline.content,
        referencedSpells,
        forLevel,
      );
      const evaluated = evaluateArithmetic(inner);
      append(evaluated !== null ? String(evaluated) : `\${${inner}}`);
      i += inline.end;
      continue;
    }

    // $NNNNvar — cross-spell reference
    if ((m = RE_CROSSREF.exec(rest))) {
      const refSpell = referencedSpells?.get(parseInt(m[1], 10));
      if (!refSpell) {
        append(m[0]); // leave placeholder; any leading '-' is preserved
      } else {
        const variable = `$${m[2]}${m[3] || ""}`;
        appendVar(resolveVariable(refSpell, variable, lvl));
      }
      i += m[0].length;
      continue;
    }

    // $lsingular:plural; — pluralization (lowercase l only)
    if ((m = RE_PLURAL.exec(rest))) {
      append(lastNumber === 1 ? m[1] : m[2]);
      i += m[0].length;
      continue;
    }

    // $gmale:female; — gender (defaults to male)
    if ((m = RE_GENDER.exec(rest))) {
      append(m[1]);
      i += m[0].length;
      continue;
    }

    // $<name> — description variable (WotLK SpellDescriptionVariables.dbc)
    if ((m = RE_DESCVAR.exec(rest))) {
      const varName = m[1];
      const expr = descVarMap.get(varName);
      if (expr !== undefined) {
        // Resolve inner variables in the expression, then evaluate arithmetic.
        const resolved = resolveSpellDescription(spell, expr, referencedSpells, forLevel);
        const evaluated = evaluateArithmetic(resolved);
        append(evaluated !== null ? String(evaluated) : resolved);
      } else {
        append(m[0]); // keep placeholder if variable not found
      }
      i += m[0].length;
      continue;
    }

    // $Xn — local variable
    if ((m = RE_LOCALVAR.exec(rest))) {
      const variable = `$${m[1]}${m[2] || ""}`;
      appendVar(resolveVariable(spell, variable, lvl));
      i += m[0].length;
      continue;
    }

    // Bare '$' with nothing recognizable after it.
    append("$");
    i++;
  }

  return result;
}

/**
 * Extract all referenced spell IDs from a template string.
 * Matches patterns like $3137s1 (spell ID 3137, variable s1)
 * and $/10;23690s1 or $*8;23690s1 (arithmetic with cross-spell ref).
 */
export function extractReferencedSpellIds(template: string): number[] {
  if (!template) return [];
  const ids = new Set<number>();
  // Direct cross-ref: $3137s1
  const directRef = /\$(\d+)([a-zA-Z])(\d)?/g;
  let match: RegExpExecArray | null;
  while ((match = directRef.exec(template)) !== null) {
    ids.add(parseInt(match[1], 10));
  }
  // Arithmetic cross-ref: $/10;23690s1  or  $*8;23690s1
  const arithRef = /\$[*/](\d+);(\d+)([a-zA-Z])(\d)?/g;
  while ((match = arithRef.exec(template)) !== null) {
    ids.add(parseInt(match[2], 10));
  }
  return Array.from(ids);
}

/**
 * Parse SpellDescriptionVariables.dbc text into a name→expression map.
 * Format: "$name=expr\n$name2=expr2\n..." where each line defines a variable.
 * Variables can reference other variables via $<name> syntax.
 * Returns a Map from variable name (without $) to its expression string.
 */
function parseDescriptionVariables(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;

  // Each line is "$name=expression" — split on newlines, parse each.
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("$")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 2) continue; // need at least "$X="
    const name = trimmed.substring(1, eqIdx); // strip leading $
    const expr = trimmed.substring(eqIdx + 1);
    map.set(name, expr);
  }
  return map;
}

/**
 * Get the resolved English description for a spell.
 */
export function getResolvedDescription(
  spell: WoWSpell,
  forLevel?: number,
): string {
  const template = getEnglishText(spell.description);
  return resolveSpellDescription(spell, template, undefined, forLevel);
}

/**
 * Get the resolved English aura description for a spell.
 */
export function getResolvedAuraDescription(
  spell: WoWSpell,
  forLevel?: number,
): string {
  const template = getEnglishText(spell.aura_description);
  return resolveSpellDescription(spell, template, undefined, forLevel);
}
