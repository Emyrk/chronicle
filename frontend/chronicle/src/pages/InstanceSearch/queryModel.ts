import type {
  InstanceSearchCount,
  InstanceSearchMatch,
  InstanceSearchNode,
  InstanceSearchOp,
  InstanceSearchParseScope,
  InstanceSearchQuery,
  InstanceSearchSort,
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
    if (n.op === "between") return pruneBetween(n);
    if (!n.op || isEmptyValue(n.value)) return undefined;
    return n;
  }
  return undefined;
}

/** A range with one end filled in becomes ≥ / ≤; with neither, it's dropped. */
function pruneBetween(n: Node): Node | undefined {
  const [lo, hi] = Array.isArray(n.value) ? n.value : [];
  const hasLo = !isEmptyValue(lo);
  const hasHi = !isEmptyValue(hi);
  if (hasLo && hasHi) return n;
  if (hasLo) return { ...n, op: ">=", value: lo };
  if (hasHi) return { ...n, op: "<=", value: hi };
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

export function buildQuery(where: Node | undefined, limit?: number, sort?: InstanceSearchSort): InstanceSearchQuery {
  const pruned = prune(where);
  return { ...(pruned ? { where: pruned } : {}), ...(sort ? { sort } : {}), ...(limit ? { limit } : {}) };
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

/** A boss killed within a time limit. */
export interface BossKillTime {
  boss: string;
  maxSeconds: number | null;
}

export type ParseMetric = "dps" | "hps";

/** One player (optionally named, optionally a class / spec) who parsed at least min. */
export interface PlayerParse {
  name: string;
  class: string;
  spec: string;
  subSpec: string;
  min: number | null;
  metric: ParseMetric;
  bosses: string[];
}

export type PlayerStatField = "dps" | "hps" | "avg_ilvl";

/** One player (optionally named) with a fight stat of at least min. */
export interface PlayerStat {
  name: string;
  stat: PlayerStatField;
  min: number | null;
  bosses: string[];
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
  maxPlayers: number | null;
  hasVideo: boolean;

  killed: string[];
  noWipes: string[];
  parseScope: InstanceSearchParseScope;
  clearParseMin: number | null;
  killParseMin: number | null;
  killParseBosses: string[];
  killParseMatch: InstanceSearchMatch;
  clearTimeMaxSeconds: number | null;
  idleTimeMaxSeconds: number | null;
  bossTimeMaxSeconds: number | null;
  trashTimeMaxSeconds: number | null;
  bossesKilledMin: number | null;
  wipesMax: number | null;
  deathsMax: number | null;
  bossKillTimes: BossKillTime[];

  classCounts: ClassCount[];
  players: string[];
  guildCounts: GuildCount[];
  playerParses: PlayerParse[];
  playerStats: PlayerStat[];

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
    maxPlayers: null,
    hasVideo: false,
    killed: [],
    noWipes: [],
    parseScope: "server",
    clearParseMin: null,
    killParseMin: null,
    killParseBosses: [],
    killParseMatch: "any",
    clearTimeMaxSeconds: null,
    idleTimeMaxSeconds: null,
    bossTimeMaxSeconds: null,
    trashTimeMaxSeconds: null,
    bossesKilledMin: null,
    wipesMax: null,
    deathsMax: null,
    bossKillTimes: [],
    classCounts: [],
    players: [],
    guildCounts: [],
    playerParses: [],
    playerStats: [],
    capabilities: [],
  };
}

/** Form fields anonymous users may search (the anonymous instance fields). */
const BASIC_KEYS: (keyof SearchForm)[] = ["zone", "zoneMatch", "realm", "guild", "guildMatch", "from", "to", "difficulty"];

/** True when the form only uses fields anonymous users may search. */
export function formIsBasic(f: SearchForm): boolean {
  const e = emptyForm();
  return (Object.keys(e) as (keyof SearchForm)[]).every((k) => BASIC_KEYS.includes(k) || JSON.stringify(f[k]) === JSON.stringify(e[k]));
}

const SECOND_MS = 1_000;

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

function bossKillTimeNode(k: BossKillTime): Node {
  const conds = [pred("encounter.name", "=", k.boss.trim()), pred("encounter.killed", "=", true)];
  if (k.maxSeconds != null) conds.push(pred("encounter.duration_ms", "<=", Math.round(k.maxSeconds * SECOND_MS)));
  return { any_encounter: { and: conds } };
}

/** class, spec, sub-spec equality on one player, in that order. */
function classSpecConds(c: { class: string; spec: string; subSpec: string }): Node[] {
  const conds: Node[] = [];
  if (c.class) conds.push(pred("player.class", "=", c.class));
  if (c.spec.trim()) conds.push(pred("player.spec", "=", c.spec.trim()));
  if (c.subSpec.trim()) conds.push(pred("player.sub_spec", "=", c.subSpec.trim()));
  return conds;
}

function bossesOpt(bosses: string[]): Partial<Node> {
  return bosses.length ? { bosses } : {};
}

/** any_player: [name], parse, [class, spec, sub-spec]. */
function playerParseNode(p: PlayerParse): Node | null {
  if (p.min == null) return null;
  const conds: Node[] = [];
  if (p.name.trim()) conds.push(pred("player.name", "=", p.name.trim()));
  conds.push(pred("player.parse", ">=", p.min, { ...bossesOpt(p.bosses), ...(p.metric === "hps" ? { metric: "hps" } : {}) }));
  conds.push(...classSpecConds(p));
  return { any_player: conds.length === 1 ? conds[0] : { and: conds } };
}

/** any_player: [name], stat. */
function playerStatNode(p: PlayerStat): Node | null {
  if (p.min == null) return null;
  const stat = pred(`player.${p.stat}`, ">=", p.min, bossesOpt(p.bosses));
  return { any_player: p.name.trim() ? { and: [pred("player.name", "=", p.name.trim()), stat] } : stat };
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
  if (f.maxPlayers != null) parts.push(pred("instance.max_players", "=", f.maxPlayers));
  if (f.hasVideo) parts.push(pred("instance.has_video", "=", true));

  for (const boss of f.killed) parts.push(killedNode(boss));
  for (const boss of f.noWipes) parts.push(noWipeNode(boss));
  for (const k of f.bossKillTimes) if (k.boss.trim()) parts.push(bossKillTimeNode(k));
  if (f.bossesKilledMin != null) parts.push(pred("instance.bosses_killed", ">=", f.bossesKilledMin));
  if (f.wipesMax != null) parts.push(pred("instance.wipes", "<=", f.wipesMax));
  if (f.deathsMax != null) parts.push(pred("instance.deaths", "<=", f.deathsMax));
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
  if (f.clearTimeMaxSeconds != null) parts.push(pred("instance.clear_time_ms", "<=", Math.round(f.clearTimeMaxSeconds * SECOND_MS)));
  if (f.idleTimeMaxSeconds != null) parts.push(pred("instance.idle_time_ms", "<=", Math.round(f.idleTimeMaxSeconds * SECOND_MS)));
  if (f.bossTimeMaxSeconds != null) parts.push(pred("instance.boss_time_ms", "<=", Math.round(f.bossTimeMaxSeconds * SECOND_MS)));
  if (f.trashTimeMaxSeconds != null) parts.push(pred("instance.trash_time_ms", "<=", Math.round(f.trashTimeMaxSeconds * SECOND_MS)));

  for (const c of f.classCounts) {
    // All parts refer to the same player: e.g. a Paladin who was Holy.
    const conds = classSpecConds(c);
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
  for (const p of f.playerParses) {
    const n = playerParseNode(p);
    if (n) parts.push(n);
  }
  for (const p of f.playerStats) {
    const n = playerStatNode(p);
    if (n) parts.push(n);
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

/** any_encounter: name, killed, [duration ≤]. */
function bossKillTimeOf(inner: Node | undefined): BossKillTime | null {
  const kids = inner?.and;
  if (!kids || inner?.or || kids.length !== 3) return null;
  const [a, b, c] = kids;
  if (!isPred(a, "encounter.name", "=") || asString(a.value) == null) return null;
  if (!isPred(b, "encounter.killed", "=") || b.value !== true) return null;
  if (!isPred(c, "encounter.duration_ms", "<=") || asNumber(c.value) == null) return null;
  return { boss: a.value as string, maxSeconds: (c.value as number) / SECOND_MS };
}

/** Splits a player block into its conditions, taking a leading name. */
function playerConds(p: Node): { name: string; rest: Node[] } | null {
  const conds = p.and ?? (p.field ? [p] : null);
  if (!conds || p.or || conds.length === 0) return null;
  const first = conds[0];
  if (isPred(first, "player.name", "=") && asString(first.value) != null && !first.bosses && !first.on) {
    return { name: first.value as string, rest: conds.slice(1) };
  }
  return { name: "", rest: [...conds] };
}

function playerParseOf(p: Node): PlayerParse | null {
  const pc = playerConds(p);
  const parse = pc?.rest[0];
  if (!pc || !parse || !isPred(parse, "player.parse", ">=") || asNumber(parse.value) == null || parse.match || parse.parse_scope || parse.on) return null;
  if (parse.metric && parse.metric !== "dps" && parse.metric !== "hps") return null;
  const rest = pc.rest.slice(1);
  const cs = rest.length ? classSpecOf(rest.length === 1 ? rest[0] : { and: rest }) : { class: "", spec: "", subSpec: "" };
  if (!cs) return null;
  return { name: pc.name, ...cs, min: parse.value as number, metric: parse.metric === "hps" ? "hps" : "dps", bosses: [...(parse.bosses ?? [])] };
}

const STAT_FIELDS: Record<string, PlayerStatField> = { "player.dps": "dps", "player.hps": "hps", "player.avg_ilvl": "avg_ilvl" };

function playerStatOf(p: Node): PlayerStat | null {
  const pc = playerConds(p);
  if (!pc || pc.rest.length !== 1) return null;
  const st = pc.rest[0];
  const stat = st.field ? STAT_FIELDS[st.field] : undefined;
  if (!stat || !isPred(st, st.field!, ">=") || asNumber(st.value) == null || st.match || st.on || st.metric || st.parse_scope) return null;
  return { name: pc.name, stat, min: st.value as number, bosses: [...(st.bosses ?? [])] };
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
      } else if (isPred(n, "instance.max_players", "=") && num != null && f.maxPlayers == null) {
        f.maxPlayers = num;
      } else if (isPred(n, "instance.has_video", "=") && n.value === true && !f.hasVideo) {
        f.hasVideo = true;
      } else if (isPred(n, "instance.bosses_killed", ">=") && num != null && f.bossesKilledMin == null) {
        f.bossesKilledMin = num;
      } else if (isPred(n, "instance.wipes", "<=") && num != null && f.wipesMax == null) {
        f.wipesMax = num;
      } else if (isPred(n, "instance.deaths", "<=") && num != null && f.deathsMax == null) {
        f.deathsMax = num;
      } else if (isPred(n, "instance.boss_time_ms", "<=") && num != null && f.bossTimeMaxSeconds == null) {
        f.bossTimeMaxSeconds = num / SECOND_MS;
      } else if (isPred(n, "instance.trash_time_ms", "<=") && num != null && f.trashTimeMaxSeconds == null) {
        f.trashTimeMaxSeconds = num / SECOND_MS;
      } else if (isPred(n, "instance.clear_parse", ">=") && num != null && f.clearParseMin == null && takeScope(n)) {
        f.clearParseMin = num;
      } else if (isPred(n, "instance.kill_time_parse", ">=") && num != null && f.killParseMin == null && takeScope(n)) {
        f.killParseMin = num;
        f.killParseBosses = [...(n.bosses ?? [])];
        f.killParseMatch = n.match === "each" ? "each" : "any";
      } else if (isPred(n, "instance.clear_time_ms", "<=") && num != null && f.clearTimeMaxSeconds == null) {
        f.clearTimeMaxSeconds = num / SECOND_MS;
      } else if (isPred(n, "instance.idle_time_ms", "<=") && num != null && f.idleTimeMaxSeconds == null) {
        f.idleTimeMaxSeconds = num / SECOND_MS;
      } else if (isPred(n, "instance.capability", "=") && s != null) {
        f.capabilities.push(s);
      } else {
        return null;
      }
      continue;
    }
    if (n.any_encounter) {
      const timed = bossKillTimeOf(n.any_encounter);
      if (timed) {
        f.bossKillTimes.push(timed);
        continue;
      }
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
      const parse = playerParseOf(p);
      if (parse) {
        f.playerParses.push(parse);
        continue;
      }
      const stat = playerStatOf(p);
      if (stat) {
        f.playerStats.push(stat);
        continue;
      }
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
