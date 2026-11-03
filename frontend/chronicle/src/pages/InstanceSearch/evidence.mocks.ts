import type { InstanceSearchEvidence, InstanceSearchWitness } from "@/api/typesGenerated";
import type { Node } from "./queryModel";

/**
 * Plausible explain evidence for any query tree, for Storybook. It assumes
 * the run matched: every condition holds except the losing side of an or and
 * the inside of a not.
 */
export function mockEvidence(n: Node, ok = true): InstanceSearchEvidence {
  if (n.and) return { kind: "and", ok, children: n.and.map((c) => mockEvidence(c, ok)) };
  if (n.or) return { kind: "or", ok, children: n.or.map((c, i) => mockEvidence(c, ok && i === 0)) };
  if (n.not) return { kind: "not", ok, children: [mockEvidence(n.not, !ok)] };
  if (n.any_player) return quantifier("any_player", n.any_player, ok, ok ? 1 : 0, true);
  if (n.any_encounter) return quantifier("any_encounter", n.any_encounter, ok, ok ? 1 : 0, false);
  if (n.count_players) return quantifier("count_players", n.count_players.where, ok, n.count_players.value + 1, true);
  if (n.count_encounters) return quantifier("count_encounters", n.count_encounters.where, ok, n.count_encounters.value, false);
  return field(n, ok);
}

const NAMES = ["Shiftwild", "Lumenra", "Thrallen", "Brightmane", "Duskweaver", "Oakhorn", "Vellith"];
const PULLS = [
  { name: "Ragnaros", outcome: "clean", duration_ms: 107_000 },
  { name: "Majordomo Executus", outcome: "clean", duration_ms: 81_000 },
  { name: "Golemagg the Incinerator", outcome: "clean", duration_ms: 64_000 },
];

function quantifier(kind: InstanceSearchEvidence["kind"], where: Node | undefined, ok: boolean, count: number, players: boolean): InstanceSearchEvidence {
  const cls = classOf(where) ?? "PALADIN";
  const witnesses: InstanceSearchWitness[] = Array.from({ length: Math.min(count, 5) }, (_, i) => ({
    ...(players
      ? { name: NAMES[i % NAMES.length], guid: `0x00000000000${1000 + i}`, class: cls, encounter_id: null }
      : { ...PULLS[i % PULLS.length], encounter_id: `00000000-0000-4000-9000-00000000000${i}` }),
    ...(where ? { evidence: mockEvidence(where, true) } : {}),
  }));
  return { kind, ok, count, witnesses };
}

function classOf(n: Node | undefined): string | undefined {
  if (!n) return undefined;
  if (n.field === "player.class" && typeof n.value === "string") return n.value;
  for (const c of n.and ?? []) {
    const found = classOf(c);
    if (found) return found;
  }
  return undefined;
}

function field(n: Node, ok: boolean): InstanceSearchEvidence {
  const name = n.field ?? "";
  const base = { kind: "field" as const, ok, field: name };
  if (name === "instance.capability") return { ...base, value: ["overheal", "unit-resources", "unit-position"] };
  if (n.bosses?.length || name.startsWith("player.") && /spec|role|dps|hps|deaths|ilvl|parse/.test(name)) {
    // Trash is one aggregated row named "Trash", as the server reports it.
    const bosses = n.on === "trash" ? ["Trash"] : n.bosses?.length ? n.bosses : ["Majordomo Executus", "Ragnaros"];
    return { ...base, rows: bosses.map((b, i) => ({ name: b, value: satisfying(n, i), ok: ok && (n.match === "each" || i === 0 || !n.bosses?.length) })) };
  }
  if (name === "instance.name") return { ...base, value: "Molten Core" };
  return { ...base, value: satisfying(n, 0) };
}

/** A value that satisfies the predicate. */
function satisfying(n: Node, i: number): unknown {
  const v = n.value;
  if (n.op === "between" && Array.isArray(v)) return v[0];
  if (Array.isArray(v)) return v[0];
  if (typeof v === "number") {
    const nudge = n.field?.endsWith("_ms") ? 7_000 * (i + 1) : i + 2;
    if (n.op === ">=" || n.op === ">") return Math.min(100, v + nudge);
    if (n.op === "<=" || n.op === "<") return Math.max(0, v - nudge);
    return v;
  }
  return v;
}
