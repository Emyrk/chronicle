import type {
  InstanceSearchCount,
  InstanceSearchMatch,
  InstanceSearchNode,
  InstanceSearchOp,
  InstanceSearchParseScope,
  InstanceSearchQuery,
} from "@/api/typesGenerated";

export type Node = InstanceSearchNode;

/* ------------------------------------------------------------------ */
/* URL encoding                                                        */
/* ------------------------------------------------------------------ */

/** Encodes a search tree for the ?q= URL parameter (base64url JSON). */
export function encodeQuery(where: Node | undefined): string {
  if (!where) return "";
  const bytes = new TextEncoder().encode(JSON.stringify(where));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes ?q=. Returns undefined for empty or malformed input. */
export function decodeQuery(encoded: string | null): Node | undefined {
  if (!encoded) return undefined;
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? (parsed as Node) : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

export function isGroup(n: Node): boolean {
  return n.and !== undefined || n.or !== undefined;
}

export function groupChildren(n: Node): readonly Node[] {
  return n.and ?? n.or ?? [];
}

/**
 * Removes incomplete parts so the server only sees valid structure: empty
 * groups disappear, single-child groups stay (the server accepts them),
 * quantifiers with nothing inside become count-all / are dropped, and
 * predicates without a value are dropped. Returns undefined when nothing is
 * left.
 */
export function prune(n: Node | undefined): Node | undefined {
  if (!n) return undefined;
  if (isGroup(n)) {
    const kids = groupChildren(n).map(prune).filter((k): k is Node => k !== undefined);
    if (kids.length === 0) return undefined;
    return n.and !== undefined ? { and: kids } : { or: kids };
  }
  if (n.not) {
    const inner = prune(n.not);
    return inner ? { not: inner } : undefined;
  }
  if (n.any_player) {
    const inner = prune(n.any_player);
    return inner ? { any_player: inner } : undefined;
  }
  if (n.any_encounter) {
    const inner = prune(n.any_encounter);
    return inner ? { any_encounter: inner } : undefined;
  }
  if (n.count_players) return { count_players: pruneCount(n.count_players) };
  if (n.count_encounters) return { count_encounters: pruneCount(n.count_encounters) };
  if (n.field) {
    if (!n.op || isEmptyValue(n.value)) return undefined;
    return n;
  }
  return undefined;
}

function pruneCount(c: InstanceSearchCount): InstanceSearchCount {
  const where = prune(c.where);
  return where ? { ...c, where } : { op: c.op, value: c.value };
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "number") return Number.isNaN(v);
  return false;
}

export function buildQuery(where: Node | undefined, limit?: number): InstanceSearchQuery {
  const pruned = prune(where);
  return { ...(pruned ? { where: pruned } : {}), ...(limit ? { limit } : {}) };
}

/* ------------------------------------------------------------------ */
/* Simple form <-> tree                                                */
/* ------------------------------------------------------------------ */

export type TextMatch = "exact" | "contains";

export interface ClassCount {
  /** Class (search API value, e.g. PRIEST). Empty = any class. */
  class: string;
  /** Optional spec, e.g. Holy. Empty = any spec. */
  spec: string;
  /** Optional sub-spec, e.g. Bear. Empty = any. */
  subSpec: string;
  min: number;
}

export interface GuildCount {
  guild: string;
  min: number;
}

/** The simple search form. Empty / null fields are ignored. */
export interface SearchForm {
  zone: string;
  zoneMatch: TextMatch;
  realm: string;
  guild: string;
  guildMatch: TextMatch;
  /** yyyy-mm-dd, inclusive. */
  from: string;
  /** yyyy-mm-dd, inclusive. */
  to: string;
  difficulty: string;

  killed: string[];
  noWipes: string[];
  parseScope: InstanceSearchParseScope;
  clearParseMin: number | null;
  killParseMin: number | null;
  killParseBosses: string[];
  killParseMatch: InstanceSearchMatch;
  clearTimeMaxMinutes: number | null;
  idleTimeMaxMinutes: number | null;

  classCounts: ClassCount[];
  players: string[];
  guildCounts: GuildCount[];

  capabilities: string[];
}

export function emptyForm(): SearchForm {
  return {
    zone: "",
    zoneMatch: "contains",
    realm: "",
    guild: "",
    guildMatch: "exact",
    from: "",
    to: "",
    difficulty: "",
    killed: [],
    noWipes: [],
    parseScope: "server",
    clearParseMin: null,
    killParseMin: null,
    killParseBosses: [],
    killParseMatch: "any",
    clearTimeMaxMinutes: null,
    idleTimeMaxMinutes: null,
    classCounts: [],
    players: [],
    guildCounts: [],
    capabilities: [],
  };
}

/** True when the form only uses fields anonymous users may search. */
export function formIsBasic(f: SearchForm): boolean {
  const e = emptyForm();
  return (
    f.killed.length === 0 &&
    f.noWipes.length === 0 &&
    f.clearParseMin == null &&
    f.killParseMin == null &&
    f.clearTimeMaxMinutes == null &&
    f.idleTimeMaxMinutes == null &&
    f.classCounts.length === 0 &&
    f.players.length === 0 &&
    f.guildCounts.length === 0 &&
    f.capabilities.length === 0 &&
    f.parseScope === e.parseScope
  );
}

const MINUTE_MS = 60_000;

function pred(field: string, op: InstanceSearchOp, value: unknown, extra: Partial<Node> = {}): Node {
  return { field, op, value, ...extra };
}

function textOp(m: TextMatch): InstanceSearchOp {
  return m === "contains" ? "contains" : "=";
}

function dayStart(date: string): string {
  return `${date}T00:00:00Z`;
}

function nextDayStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function killedNode(boss: string): Node {
  return { any_encounter: { and: [pred("encounter.name", "=", boss), pred("encounter.killed", "=", true)] } };
}

function noWipeNode(boss: string): Node {
  return { not: { any_encounter: { and: [pred("encounter.name", "=", boss), pred("encounter.outcome", "=", "wipe")] } } };
}

/** Builds the search tree for a form. Every part is ANDed together. */
export function formToTree(f: SearchForm): Node | undefined {
  const parts: Node[] = [];
  const scope = f.parseScope === "server" ? {} : { parse_scope: f.parseScope };

  if (f.zone.trim()) parts.push(pred("instance.name", textOp(f.zoneMatch), f.zone.trim()));
  if (f.realm.trim()) parts.push(pred("instance.realm", "=", f.realm.trim()));
  if (f.guild.trim()) parts.push(pred("instance.guild", textOp(f.guildMatch), f.guild.trim()));
  if (f.from) parts.push(pred("instance.started_at", ">=", dayStart(f.from)));
  if (f.to) parts.push(pred("instance.started_at", "<", nextDayStart(f.to)));
  if (f.difficulty.trim()) parts.push(pred("instance.difficulty", "=", f.difficulty.trim()));

  for (const boss of f.killed) parts.push(killedNode(boss));
  for (const boss of f.noWipes) parts.push(noWipeNode(boss));
  if (f.clearParseMin != null) parts.push(pred("instance.clear_parse", ">=", f.clearParseMin, scope));
  if (f.killParseMin != null) {
    parts.push(
      pred("instance.kill_time_parse", ">=", f.killParseMin, {
        ...scope,
        ...(f.killParseBosses.length ? { bosses: f.killParseBosses } : {}),
        ...(f.killParseBosses.length && f.killParseMatch === "each" ? { match: "each" } : {}),
      }),
    );
  }
  if (f.clearTimeMaxMinutes != null) parts.push(pred("instance.clear_time_ms", "<=", Math.round(f.clearTimeMaxMinutes * MINUTE_MS)));
  if (f.idleTimeMaxMinutes != null) parts.push(pred("instance.idle_time_ms", "<=", Math.round(f.idleTimeMaxMinutes * MINUTE_MS)));

  for (const c of f.classCounts) {
    // All parts refer to the same player: e.g. a Paladin who was Holy.
    const conds: Node[] = [];
    if (c.class) conds.push(pred("player.class", "=", c.class));
    if (c.spec.trim()) conds.push(pred("player.spec", "=", c.spec.trim()));
    if (c.subSpec.trim()) conds.push(pred("player.sub_spec", "=", c.subSpec.trim()));
    if (conds.length === 0) continue;
    const where = conds.length === 1 ? conds[0] : { and: conds };
    parts.push({ count_players: { where, op: ">=", value: c.min } });
  }
  for (const name of f.players) {
    if (name.trim()) parts.push({ any_player: pred("player.name", "=", name.trim()) });
  }
  for (const g of f.guildCounts) {
    if (g.guild.trim()) parts.push({ count_players: { where: pred("player.guild", "=", g.guild.trim()), op: ">=", value: g.min } });
  }
  for (const cap of f.capabilities) parts.push(pred("instance.capability", "=", cap));

  if (parts.length === 0) return undefined;
  return { and: parts };
}

/* Reverse mapping: recognise exactly the shapes formToTree produces. */

function isPred(n: Node, field: string, op?: InstanceSearchOp): boolean {
  return n.field === field && (op === undefined || n.op === op) && Object.keys(n).every((k) => ["field", "op", "value", "bosses", "match", "parse_scope", "metric", "on"].includes(k));
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bossOf(inner: Node | undefined, second: (n: Node) => boolean): string | null {
  const kids = inner?.and;
  if (!kids || kids.length !== 2 || inner?.or) return null;
  const [a, b] = kids;
  if (!isPred(a, "encounter.name", "=") || !second(b)) return null;
  return asString(a.value);
}

/**
 * Recognises the class / spec / sub-spec condition formToTree builds: any
 * non-empty subset of class, spec, sub_spec equality, in that order.
 */
function classSpecOf(w: Node | undefined): { class: string; spec: string; subSpec: string } | null {
  if (!w) return null;
  const conds = w.and ?? (w.field ? [w] : null);
  if (!conds || conds.length === 0 || w.or) return null;
  const out = { class: "", spec: "", subSpec: "" };
  const order: [string, keyof typeof out][] = [
    ["player.class", "class"],
    ["player.spec", "spec"],
    ["player.sub_spec", "subSpec"],
  ];
  let next = 0;
  for (const c of conds) {
    const idx = order.findIndex(([field], i) => i >= next && isPred(c, field, "="));
    const s = asString(c.value);
    if (idx < 0 || s == null || c.on || c.bosses) return null;
    out[order[idx][1]] = s;
    next = idx + 1;
  }
  return out;
}

/**
 * Converts a tree back into the form, or returns null when the tree uses
 * anything the form can't show (then it can only be edited as blocks).
 */
export function treeToForm(tree: Node | undefined): SearchForm | null {
  const f = emptyForm();
  if (!tree) return f;
  const parts = tree.and ?? (isGroup(tree) ? null : [tree]);
  if (!parts) return null;
  let scopeSeen: InstanceSearchParseScope | null = null;
  const takeScope = (n: Node): boolean => {
    const s = n.parse_scope ?? "server";
    if (scopeSeen && scopeSeen !== s) return false;
    scopeSeen = s;
    f.parseScope = s;
    return true;
  };

  for (const n of parts) {
    if (n.field) {
      const s = asString(n.value);
      const num = asNumber(n.value);
      if (isPred(n, "instance.name") && s != null && (n.op === "=" || n.op === "contains") && !f.zone) {
        f.zone = s;
        f.zoneMatch = n.op === "contains" ? "contains" : "exact";
      } else if (isPred(n, "instance.realm", "=") && s != null && !f.realm) {
        f.realm = s;
      } else if (isPred(n, "instance.guild") && s != null && (n.op === "=" || n.op === "contains") && !f.guild) {
        f.guild = s;
        f.guildMatch = n.op === "contains" ? "contains" : "exact";
      } else if (isPred(n, "instance.started_at", ">=") && s?.endsWith("T00:00:00Z") && !f.from) {
        f.from = s.slice(0, 10);
      } else if (isPred(n, "instance.started_at", "<") && s?.endsWith("T00:00:00Z") && !f.to) {
        const d = new Date(s);
        d.setUTCDate(d.getUTCDate() - 1);
        f.to = d.toISOString().slice(0, 10);
      } else if (isPred(n, "instance.difficulty", "=") && s != null && !f.difficulty) {
        f.difficulty = s;
      } else if (isPred(n, "instance.clear_parse", ">=") && num != null && f.clearParseMin == null && takeScope(n)) {
        f.clearParseMin = num;
      } else if (isPred(n, "instance.kill_time_parse", ">=") && num != null && f.killParseMin == null && takeScope(n)) {
        f.killParseMin = num;
        f.killParseBosses = [...(n.bosses ?? [])];
        f.killParseMatch = n.match === "each" ? "each" : "any";
      } else if (isPred(n, "instance.clear_time_ms", "<=") && num != null && f.clearTimeMaxMinutes == null) {
        f.clearTimeMaxMinutes = num / MINUTE_MS;
      } else if (isPred(n, "instance.idle_time_ms", "<=") && num != null && f.idleTimeMaxMinutes == null) {
        f.idleTimeMaxMinutes = num / MINUTE_MS;
      } else if (isPred(n, "instance.capability", "=") && s != null) {
        f.capabilities.push(s);
      } else {
        return null;
      }
      continue;
    }
    if (n.any_encounter) {
      const boss = bossOf(n.any_encounter, (b) => isPred(b, "encounter.killed", "=") && b.value === true);
      if (boss == null) return null;
      f.killed.push(boss);
      continue;
    }
    if (n.not?.any_encounter) {
      const boss = bossOf(n.not.any_encounter, (b) => isPred(b, "encounter.outcome", "=") && b.value === "wipe");
      if (boss == null) return null;
      f.noWipes.push(boss);
      continue;
    }
    if (n.any_player) {
      const p = n.any_player;
      if (!isPred(p, "player.name", "=") || asString(p.value) == null) return null;
      f.players.push(p.value as string);
      continue;
    }
    if (n.count_players && n.count_players.op === ">=") {
      const w = n.count_players.where;
      const min = n.count_players.value;
      const cs = classSpecOf(w);
      if (cs) {
        f.classCounts.push({ ...cs, min });
        continue;
      }
      if (w && isPred(w, "player.guild", "=") && asString(w.value)) {
        f.guildCounts.push({ guild: w.value as string, min });
        continue;
      }
    }
    return null;
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* CEL-style preview (mirrors internal/instancesearch/cel.go)          */
/* ------------------------------------------------------------------ */

function celLiteral(v: unknown, isTime: boolean): string {
  if (Array.isArray(v)) return `[${v.map((x) => celLiteral(x, isTime)).join(", ")}]`;
  if (typeof v === "string") return isTime ? `timestamp(${JSON.stringify(v)})` : JSON.stringify(v);
  return String(v);
}

function celPredicate(n: Node, v: string): string {
  const field = n.field ?? "";
  const value = celLiteral(n.value, field.endsWith("started_at"));
  if (field === "instance.capability") {
    switch (n.op) {
      case "in":
        return `instance.capabilities.exists(c, c in ${value})`;
      case "not_in":
        return `!instance.capabilities.exists(c, c in ${value})`;
      case "!=":
        return `!(${value} in instance.capabilities)`;
      default:
        return `${value} in instance.capabilities`;
    }
  }
  let name = v ? v + field.slice(field.indexOf(".")) : field;
  const opts: string[] = [];
  if (n.bosses?.length) opts.push(`"bosses": [${n.bosses.map((b) => JSON.stringify(b)).join(", ")}]`);
  if (n.match === "each") opts.push(`"match": "each"`);
  if (n.parse_scope) opts.push(`"parse_scope": ${JSON.stringify(n.parse_scope)}`);
  if (n.on) opts.push(`"on": ${JSON.stringify(n.on)}`);
  if (n.metric) opts.push(`"metric": ${JSON.stringify(n.metric)}`);
  if (opts.length) name += `({${opts.join(", ")}})`;
  switch (n.op) {
    case "in":
      return `${name} in ${value}`;
    case "not_in":
      return `!(${name} in ${value})`;
    case "contains":
      return `${name}.contains(${value})`;
    case "starts_with":
      return `${name}.startsWith(${value})`;
    case "between":
      // [low, high] -> name.between(low, high)
      return `${name}.between(${value.replace(/^\[|\]$/g, "")})`;
    case "=":
      return `${name} == ${value}`;
    default:
      return `${name} ${n.op} ${value}`;
  }
}

function celCount(list: string, v: string, c: InstanceSearchCount): string {
  const op = c.op === "=" ? "==" : c.op;
  if (!c.where) return `${list}.size() ${op} ${c.value}`;
  return `${list}.filter(${v}, ${celNode(c.where, v)}).size() ${op} ${c.value}`;
}

function celJoin(kids: readonly Node[], sep: string, v: string, parentIsAnd: boolean): string {
  return kids
    .map((k) => {
      const s = celNode(k, v);
      return (k.and !== undefined && !parentIsAnd) || (k.or !== undefined && parentIsAnd) ? `(${s})` : s;
    })
    .join(sep);
}

function celNode(n: Node, v: string): string {
  if (n.and !== undefined) return celJoin(n.and, " && ", v, true);
  if (n.or !== undefined) return celJoin(n.or, " || ", v, false);
  if (n.not) return `!(${celNode(n.not, v)})`;
  if (n.any_player) return `players.exists(p, ${celNode(n.any_player, "p")})`;
  if (n.any_encounter) return `encounters.exists(e, ${celNode(n.any_encounter, "e")})`;
  if (n.count_players) return celCount("players", "p", n.count_players);
  if (n.count_encounters) return celCount("encounters", "e", n.count_encounters);
  if (n.field) return celPredicate(n, v);
  return "<invalid>";
}

/** Renders a tree as CEL-style text, one top-level clause per line. */
export function formatCEL(n: Node | undefined): string {
  if (!n) return "true";
  if (n.and !== undefined) return celJoin(n.and, "\n&& ", "", true);
  if (n.or !== undefined) return celJoin(n.or, "\n|| ", "", false);
  return celNode(n, "");
}
