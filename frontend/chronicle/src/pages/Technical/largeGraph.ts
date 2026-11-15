import type { StateGraph, StateGraphNode } from "./stateGraph";

export const GRAPH_PAGE_SIZE = 50;
export const GRAPH_LAYOUT_NODE_LIMIT = 300;
export const GRAPH_LAYOUT_EDGE_LIMIT = 600;

export function needsBoundedInspector(graph: StateGraph): boolean {
  return graph.nodes.length > GRAPH_LAYOUT_NODE_LIMIT || (graph.dependencies?.length ?? 0) > GRAPH_LAYOUT_EDGE_LIMIT
    || graph.nodes.some((node) => node.path.split("/").length > 100);
}

/** One scan per search, no per-node reverse-reference scan or graph layout. */
export function searchGraphNodes(nodes: StateGraphNode[], query: string): StateGraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  return nodes.filter((node) => `${node.path} ${node.type ?? ""} ${node.target ?? ""}`.toLowerCase().includes(q));
}

/** Bound traversal before serialization, including giant strings and collections. */
export function metadataPreview(value: unknown): string {
  let remaining = 200;
  function visit(input: unknown, depth: number): unknown {
    if (--remaining < 0) return "… preview limit";
    if (typeof input === "string") return input.length > 500 ? `${input.slice(0, 500)}…` : input;
    if (!input || typeof input !== "object") return input;
    if (depth >= 4) return "… depth limit";
    if (Array.isArray(input)) {
      const values = input.slice(0, 20).map((item) => visit(item, depth + 1));
      if (input.length > 20) values.push(`… ${input.length - 20} more items`);
      return values;
    }
    const result: Record<string, unknown> = {};
    let count = 0;
    for (const key in input) {
      if (!Object.hasOwn(input, key)) continue;
      if (++count > 20 || remaining <= 0) { result["…"] = "More fields omitted"; break; }
      result[key.slice(0, 200)] = visit((input as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }
  return (JSON.stringify(visit(value, 0), null, 2) ?? "No metadata").slice(0, 16000);
}
