import type { InstanceSearchFieldsResponse } from "@/api/typesGenerated";
import { fieldLabel } from "./fieldLabels";
import type { Node } from "./queryModel";

export interface CostPart {
  label: string;
  /** Total cost of this part across the query. */
  cost: number;
  /** How many times it appears. */
  count: number;
}

export interface QueryCost {
  total: number;
  /** Where the cost comes from, most expensive first. */
  parts: CostPart[];
}

/**
 * The rate-limit cost the server will charge for a search, worked out the
 * same way the compiler does (instancesearch.Compile): a base, each field's
 * cost, and a weight per or group, not, player / pull block and count block;
 * and groups are free. The weights come from GET /search/fields, so they always match
 * the backend. Pass the tree that will be sent (already pruned).
 */
export function queryCost(tree: Node | undefined, desc: InstanceSearchFieldsResponse): QueryCost {
  const fieldCost = new Map(desc.fields.map((f) => [f.name, f.cost]));
  const parts = new Map<string, CostPart>();
  const add = (label: string, cost: number) => {
    const part = parts.get(label) ?? { label, cost: 0, count: 0 };
    part.cost += cost;
    part.count += 1;
    parts.set(label, part);
  };

  const walk = (n: Node | undefined) => {
    if (!n) return;
    if (n.and || n.or) {
      if (n.or) add("Or group", desc.cost_or);
      (n.and ?? n.or ?? []).forEach(walk);
    } else if (n.not) {
      add("Not", desc.cost_not);
      walk(n.not);
    }
    else if (n.any_player || n.any_encounter) {
      add(n.any_player ? "A player block" : "A pull block", desc.cost_any);
      walk(n.any_player ?? n.any_encounter);
    } else if (n.count_players || n.count_encounters) {
      add(n.count_players ? "Count players block" : "Count pulls block", desc.cost_count);
      walk((n.count_players ?? n.count_encounters)?.where);
    } else if (n.field) {
      add(fieldLabel(n.field), fieldCost.get(n.field) ?? 1);
    }
  };
  walk(tree);

  const sorted = [...parts.values()].sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label));
  const total = desc.cost_base + sorted.reduce((sum, p) => sum + p.cost, 0);
  return { total, parts: [...sorted, { label: "Base", cost: desc.cost_base, count: 1 }] };
}

/** What one block adds to a search's cost, including everything nested in it (no base). */
export function nodeCost(n: Node, desc: InstanceSearchFieldsResponse): number {
  return queryCost(n, desc).total - desc.cost_base;
}

/** Upper bounds (exclusive) for each level; anything at or above heavy is Very heavy. */
export const LEVEL_LIMITS = { light: 20, moderate: 50, heavy: 120 };

export type ComplexityLevel = "light" | "moderate" | "heavy" | "very_heavy" | "too_complex";

export interface Complexity {
  level: ComplexityLevel;
  label: string;
  /** Filled segments of the four-step meter. */
  steps: number;
}

/**
 * How heavy a search is, for a meter people can read at a glance. Absolute
 * thresholds keep a search's rating the same for everyone; anything over the
 * caller's whole budget can never run.
 */
export function complexity(cost: number, budgetLimit: number | null): Complexity {
  if (budgetLimit != null && cost > budgetLimit) return { level: "too_complex", label: "Too complex", steps: 4 };
  if (cost < LEVEL_LIMITS.light) return { level: "light", label: "Light", steps: 1 };
  if (cost < LEVEL_LIMITS.moderate) return { level: "moderate", label: "Moderate", steps: 2 };
  if (cost < LEVEL_LIMITS.heavy) return { level: "heavy", label: "Heavy", steps: 3 };
  return { level: "very_heavy", label: "Very heavy", steps: 4 };
}

/** Colours per complexity level (static class names for Tailwind). */
export const COMPLEXITY_STYLE: Record<ComplexityLevel, { pill: string; text: string; bar: string }> = {
  light: { pill: "bg-emerald-500/10 ring-emerald-500/30", text: "text-emerald-300", bar: "bg-emerald-400" },
  moderate: { pill: "bg-sky-500/10 ring-sky-500/30", text: "text-sky-300", bar: "bg-sky-400" },
  heavy: { pill: "bg-amber-500/10 ring-amber-500/35", text: "text-amber-300", bar: "bg-amber-400" },
  very_heavy: { pill: "bg-orange-500/15 ring-orange-500/40", text: "text-orange-300", bar: "bg-orange-400" },
  too_complex: { pill: "bg-red-500/15 ring-red-500/45", text: "text-red-300", bar: "bg-red-400" },
};

