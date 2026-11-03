import type { InstanceSearchCount, InstanceSearchOp } from "@/api/typesGenerated";
import type { Node } from "./queryModel";

/**
 * Parses the CEL-style query text that formatCEL produces back into a
 * search tree. It covers that dialect only:
 *
 *   instance.name.contains("molten") && instance.clear_parse >= 95
 *   players.exists(p, p.class == "DRUID" && p.sub_spec({"on": "trash"}) == "Bear")
 *   players.filter(p, p.class == "PRIEST").size() >= 3
 *   encounters.exists(e, e.name == "Ragnaros" && e.killed == true)
 *   "unit-position" in instance.capabilities
 *   !(x) , a || b , (a || b) && c , x in ["a", "b"] , timestamp("2026-10-01T00:00:00Z")
 *
 * It checks syntax only; the server validates fields, operators and values.
 */

export class CelParseError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(message);
    this.offset = offset;
  }
}

type Tok =
  | { kind: "ident"; value: string; at: number }
  | { kind: "string"; value: string; at: number }
  | { kind: "number"; value: number; at: number }
  | { kind: "punct"; value: string; at: number }
  | { kind: "eof"; at: number };

const PUNCT = ["&&", "||", "==", "!=", "<=", ">=", "<", ">", "!", "(", ")", "[", "]", "{", "}", ",", ":", "."];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"') {
      // JSON string (formatCEL uses JSON.stringify).
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      if (j >= src.length) throw new CelParseError("Unterminated string", i);
      try {
        toks.push({ kind: "string", value: JSON.parse(src.slice(i, j + 1)) as string, at: i });
      } catch {
        throw new CelParseError("Invalid string", i);
      }
      i = j + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num && (c !== "-" || /\d/.test(src[i + 1] ?? ""))) {
      toks.push({ kind: "number", value: Number(num[0]), at: i });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      toks.push({ kind: "ident", value: id[0], at: i });
      i += id[0].length;
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) throw new CelParseError(`Unexpected character "${c}"`, i);
    toks.push({ kind: "punct", value: p, at: i });
    i += p.length;
  }
  toks.push({ kind: "eof", at: src.length });
  return toks;
}

const CMP: Record<string, InstanceSearchOp> = { "==": "=", "!=": "!=", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };
const OPTION_KEYS = new Set(["bosses", "match", "parse_scope", "metric", "on"]);

/** Variables bound by a quantifier, e.g. p -> "player". */
type Scope = Map<string, string>;

class Parser {
  private i = 0;
  private toks: Tok[];
  constructor(src: string) {
    this.toks = tokenize(src);
  }

  private peek(o = 0): Tok {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)];
  }
  private next(): Tok {
    return this.toks[this.i++];
  }
  private isPunct(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.kind === "punct" && t.value === v;
  }
  private isIdent(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.kind === "ident" && t.value === v;
  }
  private fail(msg: string, t: Tok = this.peek()): never {
    throw new CelParseError(msg, t.at);
  }
  private expectPunct(v: string): void {
    if (!this.isPunct(v)) this.fail(`Expected "${v}"`);
    this.i++;
  }
  private expectIdent(v?: string): string {
    const t = this.peek();
    if (t.kind !== "ident" || (v && t.value !== v)) this.fail(v ? `Expected "${v}"` : "Expected a name");
    this.i++;
    return (t as { value: string }).value;
  }

  parse(): Node {
    const n = this.or(new Map());
    if (this.peek().kind !== "eof") this.fail("Unexpected text after the end of the query");
    return n;
  }

  private or(scope: Scope): Node {
    const parts = [this.and(scope)];
    while (this.isPunct("||")) {
      this.i++;
      parts.push(this.and(scope));
    }
    return parts.length === 1 ? parts[0] : { or: parts.flatMap((p) => (p.or && !p.and ? [...p.or] : [p])) };
  }

  private and(scope: Scope): Node {
    const parts = [this.unary(scope)];
    while (this.isPunct("&&")) {
      this.i++;
      parts.push(this.unary(scope));
    }
    return parts.length === 1 ? parts[0] : { and: parts.flatMap((p) => (p.and && !p.or ? [...p.and] : [p])) };
  }

  private unary(scope: Scope): Node {
    if (this.isPunct("!")) {
      this.i++;
      // !instance.capabilities.exists(c, c in [...]) -> capability not_in
      if (this.isIdent("instance") && this.isPunct(".", 1) && this.isIdent("capabilities", 2)) {
        const n = this.primary(scope);
        if (n.op === "in") return { ...n, op: "not_in" };
        return { not: n };
      }
      const inner = this.unary(scope);
      // !(x in [..]) -> not_in ; !("cap" in instance.capabilities) -> !=
      if (inner.field && inner.op === "in" && Array.isArray(inner.value)) return { ...inner, op: "not_in" };
      if (inner.field === "instance.capability" && inner.op === "=") return { ...inner, op: "!=" };
      return { not: inner };
    }
    return this.primary(scope);
  }

  private primary(scope: Scope): Node {
    const t = this.peek();
    if (this.isPunct("(")) {
      this.i++;
      const n = this.or(scope);
      this.expectPunct(")");
      return n;
    }
    // "cap" in instance.capabilities
    if (t.kind === "string") {
      this.i++;
      this.expectIdent("in");
      this.expectIdent("instance");
      this.expectPunct(".");
      this.expectIdent("capabilities");
      return { field: "instance.capability", op: "=", value: t.value };
    }
    if (t.kind === "ident" && (t.value === "players" || t.value === "encounters") && this.isPunct(".", 1)) {
      return this.quantifier(scope);
    }
    if (this.isIdent("instance") && this.isPunct(".", 1) && this.isIdent("capabilities", 2)) {
      // instance.capabilities.exists(c, c in [...])
      this.i += 3;
      this.expectPunct(".");
      this.expectIdent("exists");
      this.expectPunct("(");
      const v = this.expectIdent();
      this.expectPunct(",");
      if (this.expectIdent() !== v) this.fail(`Expected "${v}"`);
      this.expectIdent("in");
      const list = this.literal();
      this.expectPunct(")");
      return { field: "instance.capability", op: "in", value: list };
    }
    if (t.kind === "ident") return this.predicate(scope);
    return this.fail("Expected a condition");
  }

  private quantifier(scope: Scope): Node {
    const listTok = this.next() as { value: string; at: number };
    const kind = listTok.value === "players" ? "player" : "encounter";
    if (scope.size > 0) this.fail("players / encounters can only be used at the top level", listTok as Tok);
    this.expectPunct(".");
    const method = this.expectIdent();
    if (method === "size") {
      this.expectPunct("(");
      this.expectPunct(")");
      const c = this.countTail();
      return kind === "player" ? { count_players: c } : { count_encounters: c };
    }
    if (method !== "exists" && method !== "filter") this.fail(`Unknown method "${method}" (use exists, filter or size)`);
    this.expectPunct("(");
    const v = this.expectIdent();
    this.expectPunct(",");
    const inner = this.or(new Map([[v, kind]]));
    this.expectPunct(")");
    if (method === "exists") return kind === "player" ? { any_player: inner } : { any_encounter: inner };
    this.expectPunct(".");
    this.expectIdent("size");
    this.expectPunct("(");
    this.expectPunct(")");
    const c = { ...this.countTail(), where: inner };
    return kind === "player" ? { count_players: c } : { count_encounters: c };
  }

  private countTail(): InstanceSearchCount {
    const t = this.next();
    if (t.kind !== "punct" || !CMP[t.value]) this.fail("Expected a comparison like >= 3", t);
    const n = this.next();
    if (n.kind !== "number") this.fail("Expected a number", n);
    return { op: CMP[(t as { value: string }).value], value: (n as { value: number }).value };
  }

  private predicate(scope: Scope): Node {
    const first = this.next() as { value: string; at: number };
    let prefix: string;
    if (first.value === "instance") prefix = "instance";
    else if (scope.has(first.value)) prefix = scope.get(first.value)!;
    else this.fail(`Unknown name "${first.value}" (use instance.…, or a variable from players / encounters)`, first as Tok);
    this.expectPunct(".");
    const field = `${prefix}.${this.expectIdent()}`;
    let node: Node = { field };

    // Options: field({"bosses": [...], "match": "each"})
    if (this.isPunct("(")) {
      this.i++;
      const opts = this.literal();
      if (!opts || typeof opts !== "object" || Array.isArray(opts)) this.fail("Expected options like {\"bosses\": [...]}");
      for (const [k, v] of Object.entries(opts as Record<string, unknown>)) {
        if (!OPTION_KEYS.has(k)) this.fail(`Unknown option "${k}"`);
        node = { ...node, [k]: v } as Node;
      }
      this.expectPunct(")");
    }

    // .contains("x") / .startsWith("x")
    if (this.isPunct(".")) {
      this.i++;
      const m = this.expectIdent();
      if (m === "between") {
        // .between(low, high)
        this.expectPunct("(");
        const low = this.literal();
        this.expectPunct(",");
        const high = this.literal();
        this.expectPunct(")");
        return { ...node, op: "between", value: [low, high] };
      }
      const op: InstanceSearchOp | undefined = m === "contains" ? "contains" : m === "startsWith" ? "starts_with" : undefined;
      if (!op) this.fail(`Unknown method "${m}" (use contains, startsWith or between)`);
      this.expectPunct("(");
      const value = this.literal();
      this.expectPunct(")");
      return { ...node, op, value };
    }
    if (this.isIdent("in")) {
      this.i++;
      const value = this.literal();
      if (!Array.isArray(value)) this.fail("Expected a list after in");
      return { ...node, op: "in", value };
    }
    const t = this.next();
    if (t.kind !== "punct" || !CMP[t.value]) this.fail("Expected ==, !=, <, <=, >, >=, in, .contains(), .startsWith() or .between()", t);
    return { ...node, op: CMP[(t as { value: string }).value], value: this.literal() };
  }

  /** string, number, true/false, timestamp("..."), [list] or {"key": value}. */
  private literal(): unknown {
    const t = this.next();
    if (t.kind === "string" || t.kind === "number") return t.value;
    if (t.kind === "ident") {
      if (t.value === "true") return true;
      if (t.value === "false") return false;
      if (t.value === "timestamp") {
        this.expectPunct("(");
        const s = this.next();
        if (s.kind !== "string") this.fail("Expected a date string", s);
        this.expectPunct(")");
        return (s as { value: string }).value;
      }
    }
    if (t.kind === "punct" && t.value === "[") {
      const out: unknown[] = [];
      while (!this.isPunct("]")) {
        out.push(this.literal());
        if (!this.isPunct("]")) this.expectPunct(",");
      }
      this.i++;
      return out;
    }
    if (t.kind === "punct" && t.value === "{") {
      const out: Record<string, unknown> = {};
      while (!this.isPunct("}")) {
        const k = this.next();
        if (k.kind !== "string") this.fail("Expected a quoted option name", k);
        this.expectPunct(":");
        out[(k as { value: string }).value] = this.literal();
        if (!this.isPunct("}")) this.expectPunct(",");
      }
      this.i++;
      return out;
    }
    return this.fail("Expected a value", t);
  }
}

/** Parses query text. Empty text means "no conditions" (undefined). */
export function parseCEL(src: string): Node | undefined {
  if (src.trim() === "" || src.trim() === "true") return undefined;
  return new Parser(src).parse();
}

/** 1-based line and column of an offset, for error messages. */
export function lineCol(src: string, offset: number): { line: number; col: number } {
  const before = src.slice(0, offset).split("\n");
  return { line: before.length, col: before[before.length - 1].length + 1 };
}
