import { treeToForm, type Node, type SearchForm } from "./queryModel";

export interface SearchDraftPlan {
  where: Node;
  mode: "form" | "blocks";
  form: SearchForm | null;
}

/** Plan an unsent editor change. The server validates the tree before asking the browser to apply it. */
export function planSearchDraftUpdate(argumentsValue: unknown, advancedUnlocked: boolean, currentRevision: number): SearchDraftPlan {
  if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
    throw new Error("Invalid search draft arguments.");
  }
  const input = argumentsValue as Record<string, unknown>;
  const where = input.where;
  if (Object.keys(input).length !== 2 || !Number.isSafeInteger(input.expected_revision) || (input.expected_revision as number) < 0 || !where || typeof where !== "object" || Array.isArray(where)) {
    throw new Error("A search where tree is required.");
  }
  if (input.expected_revision !== currentRevision) {
    throw new Error("stale_state");
  }
  // The transport and server cap arguments as well. Do not let an oversized
  // draft pass into the editor even if the browser handler is called directly.
  const json = JSON.stringify(where);
  if (new TextEncoder().encode(json).byteLength > 16 * 1024) {
    throw new Error("Search draft is too large.");
  }
  const tree = JSON.parse(json) as Node;
  const form = treeToForm(tree);
  if (!advancedUnlocked && !form) {
    throw new Error("This search needs the advanced editor, available to Honored supporters.");
  }
  return { where: tree, mode: advancedUnlocked && !form ? "blocks" : "form", form };
}
