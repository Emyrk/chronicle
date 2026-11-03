/**
 * Syntax colouring for the CEL-style query text. Unlike the parser this never
 * fails: half-typed input (an unterminated string, a stray character) still
 * colours, so it can run on every keystroke.
 */

export type CelTokenKind = "root" | "call" | "field" | "string" | "number" | "literal" | "operator" | "punct" | "space" | "other";

export interface CelToken {
  kind: CelTokenKind;
  text: string;
  /** Offset of the first character in the source. */
  at: number;
}

const ROOTS = new Set(["instance", "players", "encounters"]);
const LITERALS = new Set(["true", "false", "in"]);
const OPERATORS = ["&&", "||", "==", "!=", "<=", ">=", "<", ">", "!"];

export function highlightCEL(src: string): CelToken[] {
  const out: CelToken[] = [];
  let i = 0;
  const push = (kind: CelTokenKind, end: number) => {
    out.push({ kind, text: src.slice(i, end), at: i });
    i = end;
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      push("space", j);
    } else if (c === '"') {
      // Up to the closing quote, honouring escapes; unterminated runs to the end of the line.
      let j = i + 1;
      while (j < src.length && src[j] !== '"' && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      push("string", Math.min(src.length, src[j] === '"' ? j + 1 : j));
    } else if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^-?[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      push("number", i + m[0].length);
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const word = m[0];
      const end = i + word.length;
      const next = src.slice(end).match(/^\s*\(/);
      const afterDot = out.length > 0 && out[out.length - 1].text === ".";
      let kind: CelTokenKind = "field";
      if (LITERALS.has(word)) kind = "literal";
      else if (next) kind = "call";
      else if (!afterDot && ROOTS.has(word)) kind = "root";
      push(kind, end);
    } else {
      const op = OPERATORS.find((o) => src.startsWith(o, i));
      if (op) push("operator", i + op.length);
      else if ("()[]{},.:".includes(c)) push("punct", i + 1);
      else push("other", i + 1);
    }
  }
  return out;
}

/** Tailwind text colour per token kind. */
export const CEL_TOKEN_CLASS: Record<CelTokenKind, string> = {
  root: "text-sky-300",
  call: "text-violet-300",
  field: "text-zinc-100",
  string: "text-emerald-300",
  number: "text-amber-300",
  literal: "text-orange-300",
  operator: "text-slate-400",
  punct: "text-zinc-500",
  space: "",
  other: "text-red-300",
};
