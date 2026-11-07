// Pure model for the parser state graph explorer. Mirrors the JSON format
// produced by internal/stategraph (Graph, Node, Dependency) and ports its
// validation so the explorer can show problems in hand-written payloads.

export type StateGraphKind = "directory" | "value" | "reference";

export interface StateGraphNode {
  path: string;
  kind: StateGraphKind;
  type?: string;
  target?: string;
  metadata?: unknown;
}

export interface StateGraphDependency {
  from: string;
  to: string;
}

export interface StateGraph {
  version: number;
  root: string;
  nodes: StateGraphNode[];
  dependencies?: StateGraphDependency[];
}

export interface StateGraphIssue {
  path?: string;
  message: string;
}

export interface ParseResult {
  graph?: StateGraph;
  issues: StateGraphIssue[];
}

/** Parses and shape-checks a JSON payload. Semantic checks live in validateStateGraph. */
export function parseStateGraph(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { issues: [{ message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }] };
  }
  return coerceStateGraph(raw);
}

export function coerceStateGraph(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { issues: [{ message: "Payload must be a JSON object" }] };
  const issues: StateGraphIssue[] = [];
  if (typeof raw.root !== "string") issues.push({ message: "\"root\" must be a string" });
  if (!Array.isArray(raw.nodes)) issues.push({ message: "\"nodes\" must be an array" });
  if (raw.dependencies !== undefined && raw.dependencies !== null && !Array.isArray(raw.dependencies)) {
    issues.push({ message: "\"dependencies\" must be an array when present" });
  }
  if (issues.length > 0) return { issues };

  const nodes: StateGraphNode[] = [];
  (raw.nodes as unknown[]).forEach((node, i) => {
    if (!isRecord(node) || typeof node.path !== "string" || typeof node.kind !== "string") {
      issues.push({ message: `nodes[${i}] must have string "path" and "kind"` });
      return;
    }
    nodes.push({
      path: node.path,
      kind: node.kind as StateGraphKind,
      type: typeof node.type === "string" && node.type !== "" ? node.type : undefined,
      target: typeof node.target === "string" && node.target !== "" ? node.target : undefined,
      metadata: node.metadata,
    });
  });

  const dependencies: StateGraphDependency[] = [];
  ((raw.dependencies as unknown[] | undefined) ?? []).forEach((dep, i) => {
    if (!isRecord(dep) || typeof dep.from !== "string" || typeof dep.to !== "string") {
      issues.push({ message: `dependencies[${i}] must have string "from" and "to"` });
      return;
    }
    dependencies.push({ from: dep.from, to: dep.to });
  });

  if (raw.version !== 1) {
    issues.push({ message: `Unsupported version ${JSON.stringify(raw.version)}; explorer understands version 1` });
  }

  return {
    graph: { version: Number(raw.version), root: raw.root as string, nodes, dependencies },
    issues,
  };
}

export interface GraphIndex {
  graph: StateGraph;
  byPath: Map<string, StateGraphNode>;
  children: Map<string, string[]>;
  referencesTo: Map<string, string[]>;
  depsFrom: Map<string, string[]>;
  depsTo: Map<string, string[]>;
}

export function indexStateGraph(graph: StateGraph): GraphIndex {
  const byPath = new Map<string, StateGraphNode>();
  for (const node of graph.nodes) byPath.set(node.path, node);

  const children = new Map<string, string[]>();
  const referencesTo = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.path !== graph.root) push(children, parentPath(node.path), node.path);
    if (node.kind === "reference" && node.target) push(referencesTo, node.target, node.path);
  }
  for (const list of children.values()) list.sort();

  const depsFrom = new Map<string, string[]>();
  const depsTo = new Map<string, string[]>();
  for (const dep of graph.dependencies ?? []) {
    push(depsFrom, dep.from, dep.to);
    push(depsTo, dep.to, dep.from);
  }
  return { graph, byPath, children, referencesTo, depsFrom, depsTo };
}

/** Ports stategraph.Registry.validate, but collects every issue instead of stopping at the first. */
export function validateStateGraph(graph: StateGraph): StateGraphIssue[] {
  const issues: StateGraphIssue[] = [];
  const byPath = new Map<string, StateGraphNode>();

  const rootErr = pathError(graph.root);
  if (rootErr) issues.push({ path: graph.root, message: rootErr });

  for (const node of graph.nodes) {
    const err = pathError(node.path);
    if (err) issues.push({ path: node.path, message: err });
    if (byPath.has(node.path)) issues.push({ path: node.path, message: "Path is registered more than once" });
    byPath.set(node.path, node);
  }

  const root = byPath.get(graph.root);
  if (!root) issues.push({ path: graph.root, message: "Root is not registered" });
  else if (root.kind !== "directory") issues.push({ path: graph.root, message: "Root must be a directory" });

  for (const node of byPath.values()) {
    const p = node.path;
    if (p !== graph.root) {
      if (!isWithin(p, graph.root)) issues.push({ path: p, message: `Path is outside root ${graph.root}` });
      const parent = byPath.get(parentPath(p));
      if (!parent && isWithin(p, graph.root)) {
        issues.push({ path: p, message: `Missing parent ${parentPath(p)}` });
      } else if (parent?.kind === "reference") {
        issues.push({ path: p, message: `Reference ${parent.path} cannot have children` });
      }
    }

    switch (node.kind) {
      case "directory":
        if (node.type || node.target) issues.push({ path: p, message: "Directory cannot have a type or target" });
        break;
      case "value":
        if (!node.type) issues.push({ path: p, message: "Value requires a type" });
        if (node.target) issues.push({ path: p, message: "Value cannot have a target" });
        break;
      case "reference": {
        if (!node.type || !node.target) {
          issues.push({ path: p, message: "Reference requires an expected type and target" });
          break;
        }
        const target = byPath.get(node.target);
        if (!target) issues.push({ path: p, message: `Missing target ${node.target}` });
        else if (target.kind !== "value") issues.push({ path: p, message: `Target ${node.target} must be a value` });
        else if (target.type !== node.type) {
          issues.push({ path: p, message: `Expects type ${node.type}, target has ${target.type}` });
        }
        break;
      }
      default:
        issues.push({ path: p, message: `Unknown kind ${JSON.stringify(node.kind)}` });
    }
  }

  const seen = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const dep of graph.dependencies ?? []) {
    const key = `${dep.from}\u0000${dep.to}`;
    if (seen.has(key)) issues.push({ path: dep.from, message: `Duplicate dependency on ${dep.to}` });
    seen.add(key);
    if (!byPath.has(dep.from)) issues.push({ path: dep.from, message: "Dependency source is not registered" });
    if (!byPath.has(dep.to)) issues.push({ path: dep.from, message: `Dependency target ${dep.to} is not registered` });
    if (dep.from === dep.to) issues.push({ path: dep.from, message: "Dependency cannot target itself" });
    else push(adjacency, dep.from, dep.to);
  }
  const cycle = findCycle(adjacency);
  if (cycle) issues.push({ path: cycle[0], message: `Dependency cycle: ${cycle.join(" → ")}` });

  return issues;
}

// ---------------------------------------------------------------------------
// Layered "canonical value" view: value nodes (plus any node named by a
// dependency) become boxes. Reference nodes are folded onto the nearest boxed
// ancestor as an owner → target edge, merged with dependency edges.

export interface LayoutBox {
  path: string;
  x: number;
  y: number;
  layer: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  dependency: boolean;
  references: string[];
}

export interface GraphLayout {
  boxes: LayoutBox[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export const BOX_WIDTH = 184;
export const BOX_HEIGHT = 58;
const GAP_X = 20;
const GAP_Y = 96;
const PAD = 24;

export function layoutStateGraph(index: GraphIndex): GraphLayout {
  const { graph, byPath } = index;
  const boxed = new Set<string>();
  for (const node of graph.nodes) if (node.kind === "value") boxed.add(node.path);
  for (const dep of graph.dependencies ?? []) {
    if (byPath.has(dep.from)) boxed.add(dep.from);
    if (byPath.has(dep.to)) boxed.add(dep.to);
  }

  const edgeMap = new Map<string, LayoutEdge>();
  const edgeFor = (from: string, to: string) => {
    const key = `${from}\u0000${to}`;
    let edge = edgeMap.get(key);
    if (!edge) {
      edge = { from, to, dependency: false, references: [] };
      edgeMap.set(key, edge);
    }
    return edge;
  };
  for (const dep of graph.dependencies ?? []) {
    if (boxed.has(dep.from) && boxed.has(dep.to) && dep.from !== dep.to) edgeFor(dep.from, dep.to).dependency = true;
  }
  for (const node of graph.nodes) {
    if (node.kind !== "reference" || !node.target || !boxed.has(node.target)) continue;
    const owner = boxedOwner(node.path, boxed, graph.root);
    if (owner && owner !== node.target) edgeFor(owner, node.target).references.push(node.path);
  }
  const edges = [...edgeMap.values()].sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));

  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const edge of edges) {
    push(out, edge.from, edge.to);
    push(inc, edge.to, edge.from);
  }

  // Depth = longest outgoing path, so dependencies sit below their dependents.
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (p: string): number => {
    const known = depth.get(p);
    if (known !== undefined) return known;
    if (visiting.has(p)) return 0; // reference cycles are allowed; break them here
    visiting.add(p);
    let d = 0;
    for (const next of out.get(p) ?? []) d = Math.max(d, depthOf(next) + 1);
    visiting.delete(p);
    depth.set(p, d);
    return d;
  };
  const sortedBoxed = [...boxed].sort();
  sortedBoxed.forEach(depthOf);
  const maxDepth = Math.max(0, ...depth.values());

  const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const p of sortedBoxed) layers[maxDepth - (depth.get(p) ?? 0)].push(p);

  // A few barycenter sweeps to reduce crossings.
  const position = new Map<string, number>();
  const reindex = () => layers.forEach((layer) => layer.forEach((p, i) => position.set(p, i)));
  reindex();
  const barycenter = (p: string, neighbors: Map<string, string[]>) => {
    const list = neighbors.get(p) ?? [];
    if (list.length === 0) return position.get(p) ?? 0;
    return list.reduce((sum, n) => sum + (position.get(n) ?? 0), 0) / list.length;
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const layer of order) {
      const scores = new Map(layer.map((p) => [p, barycenter(p, down ? inc : out)]));
      layer.sort((a, b) => (scores.get(a)! - scores.get(b)!) || a.localeCompare(b));
      reindex();
    }
  }

  const widest = Math.max(1, ...layers.map((layer) => layer.length));
  const width = PAD * 2 + widest * BOX_WIDTH + (widest - 1) * GAP_X;
  const height = PAD * 2 + layers.length * BOX_HEIGHT + Math.max(0, layers.length - 1) * GAP_Y;
  const boxes: LayoutBox[] = [];
  layers.forEach((layer, li) => {
    const rowWidth = layer.length * BOX_WIDTH + (layer.length - 1) * GAP_X;
    const startX = (width - rowWidth) / 2;
    layer.forEach((p, i) => {
      boxes.push({ path: p, layer: li, x: startX + i * (BOX_WIDTH + GAP_X), y: PAD + li * (BOX_HEIGHT + GAP_Y) });
    });
  });
  return { boxes, edges, width, height };
}

/** The boxed node that visually owns p: itself or its nearest boxed ancestor. */
export function boxedOwner(p: string, boxed: Set<string>, root: string): string | undefined {
  let current = p === root ? p : parentPath(p);
  for (;;) {
    if (boxed.has(current)) return current;
    if (current === root || current === "/") return undefined;
    current = parentPath(current);
  }
}

// ---------------------------------------------------------------------------
// Small helpers shared with the page.

export function parentPath(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

export function baseName(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1) || "/";
}

/** "github.com/x/y/pkg.Type" → "pkg.Type". */
export function shortType(type?: string): string {
  if (!type) return "";
  return type.slice(type.lastIndexOf("/") + 1);
}

export function isWithin(p: string, ancestor: string): boolean {
  return p === ancestor || p.startsWith(ancestor === "/" ? "/" : `${ancestor}/`);
}

export interface NodeMetadata {
  label?: string;
  source?: string;
}

export function metadataOf(node?: StateGraphNode): NodeMetadata {
  if (!node || !isRecord(node.metadata)) return {};
  const { label, source } = node.metadata;
  return {
    label: typeof label === "string" ? label : undefined,
    source: typeof source === "string" ? source : undefined,
  };
}

function pathError(p: string): string | undefined {
  if (!p.startsWith("/")) return "Path must be absolute";
  if (p !== "/" && (p.endsWith("/") || p.includes("//") || /\/\.\.?(\/|$)/.test(p))) {
    return "Path is not normalized";
  }
  return undefined;
}

function findCycle(adjacency: Map<string, string[]>): string[] | undefined {
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (p: string): string[] | undefined => {
    state.set(p, 1);
    stack.push(p);
    for (const next of adjacency.get(p) ?? []) {
      const s = state.get(next);
      if (s === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (s === undefined) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(p, 2);
    return undefined;
  };
  for (const p of [...adjacency.keys()].sort()) {
    if (!state.has(p)) {
      const found = visit(p);
      if (found) return found;
    }
  }
  return undefined;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
