import { parentPath, type GraphIndex, type StateGraphNode } from "./stateGraph";

// Exact serialized types only: new/unknown types must stay discoverable by default.
export const IMPLEMENTATION_TYPES = new Set([
  "parsernext/vanilla.PreparedSpell", "period.Moment", "period.WorkingPeriod.Inactivity",
  "characters.Base.Inactivity", "vanilla.Base.Totem", "vanilla.TotemPeriod",
  "messages.Damage", "messages.Timeout", "messages.Slain", "messages.ResourceChange",
  "messages.Aura",
]);

export function isSemanticObject(node: StateGraphNode): boolean {
  return node.kind === "value" && !IMPLEMENTATION_TYPES.has(node.type ?? "");
}

/** Resolve slot aliases to objects using existing adjacency maps, never scan all nodes per object. */
export function objectRelations(index: GraphIndex, path: string) {
  const targets = new Set<string>();
  for (const child of index.children.get(path) ?? []) {
    const node = index.byPath.get(child);
    if (node?.kind === "reference" && node.target) targets.add(node.target);
    else if (node?.kind === "value") targets.add(child);
  }
  const highLevel: string[] = [];
  const implementation: string[] = [];
  for (const target of targets) {
    const node = index.byPath.get(target);
    (node && IMPLEMENTATION_TYPES.has(node.type ?? "") ? implementation : highLevel).push(target);
  }
  const owners = [...new Set((index.referencesTo.get(path) ?? []).map(parentPath))];
  return { highLevel, implementation, owners };
}
