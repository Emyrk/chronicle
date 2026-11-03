import type { InstanceSearchCount } from "@/api/typesGenerated";
import { OP_LABELS, enumLabel, fieldLabel } from "./fieldLabels";
import type { Node } from "./queryModel";

const MS_FIELDS = /_ms$/;

/** "75 min" / "1h 15m" */
export function formatMinutes(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatValue(field: string, value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => formatValue(field, v)).join(", ");
  if (typeof value === "number") return MS_FIELDS.test(field) ? formatMinutes(value) : String(value);
  if (typeof value === "string") {
    if (field.endsWith("started_at")) return value.slice(0, 10);
    if (/^[A-Z_]+$/.test(value) || field.endsWith("capability") || field.endsWith("outcome") || field.endsWith("category")) return enumLabel(value);
    return `"${value}"`;
  }
  return String(value);
}

function describePredicate(n: Node): string {
  const field = n.field ?? "";
  if (field === "instance.capability") {
    const v = formatValue(field, n.value);
    switch (n.op) {
      case "!=":
        return `Lacks ${v}`;
      case "in":
        return `Has any of ${v}`;
      case "not_in":
        return `Has none of ${v}`;
      default:
        return `Has ${v}`;
    }
  }
  const label = fieldLabel(field);
  let text: string;
  if (typeof n.value === "boolean") {
    text = n.value === (n.op !== "!=") ? label : `Not ${label.toLowerCase()}`;
  } else if (n.op === "between" && Array.isArray(n.value)) {
    text = `${label} ${formatValue(field, n.value[0])} – ${formatValue(field, n.value[1])}`;
  } else {
    text = `${label} ${OP_LABELS[n.op ?? "="]} ${formatValue(field, n.value)}`;
  }
  const extras: string[] = [];
  if (n.on === "trash") extras.push("on trash");
  if (n.on === "any") extras.push("in any fight");
  if (n.bosses?.length) extras.push(`${n.match === "each" ? "on each of" : "on"} ${n.bosses.join(", ")}`);
  if (n.parse_scope && n.parse_scope !== "server") extras.push(`vs ${n.parse_scope}`);
  if (n.metric === "hps") extras.push("(HPS)");
  return extras.length ? `${text} ${extras.join(" ")}` : text;
}

function describeCount(c: InstanceSearchCount, noun: string): string {
  const head = `${OP_LABELS[c.op]} ${c.value} ${noun}`;
  return c.where ? `${head} with ${describe(c.where)}` : head;
}

/** One-line description of a node, e.g. "A pull: Name is "Ragnaros" & Killed". */
export function describe(n: Node): string {
  if (n.and) return n.and.map(describe).join(" & ");
  if (n.or) return `(${n.or.map(describe).join(" or ")})`;
  if (n.not) return `Not: ${describe(n.not)}`;
  if (n.any_player) return `A player: ${describe(n.any_player)}`;
  if (n.any_encounter) return `A pull: ${describe(n.any_encounter)}`;
  if (n.count_players) return describeCount(n.count_players, "players");
  if (n.count_encounters) return describeCount(n.count_encounters, "pulls");
  if (n.field) return describePredicate(n);
  return "…";
}

/** One chip per top-level condition (they are ANDed together). */
export function summarize(tree: Node | undefined): string[] {
  if (!tree) return [];
  if (tree.and) return tree.and.map(describe);
  if (tree.or) return [describe(tree).replace(/^\((.*)\)$/, "$1")];
  return [describe(tree)];
}

/** "1:47" for short durations, "1h 12m" for long ones. */
export function formatDuration(ms: number): string {
  if (ms >= 3_600_000) {
    const totalMin = Math.round(ms / 60_000);
    return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, "0")}m`;
  }
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A value from the server, formatted for its field. */
export function formatEvidence(field: string, value: unknown): string {
  if (typeof value === "number") {
    if (/_ms$/.test(field)) return formatDuration(value);
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string" && !/^[A-Z_]+$/.test(value) && !field.endsWith("started_at")) return value === "" ? "none" : value;
  return formatValue(field, value);
}
