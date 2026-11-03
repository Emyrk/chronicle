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
 * cost, and a weight per player / pull block and per count block; and / or /
 * not are free. The weights come from GET /search/fields, so they always match
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
    if (n.and || n.or) (n.and ?? n.or ?? []).forEach(walk);
    else if (n.not) walk(n.not);
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
