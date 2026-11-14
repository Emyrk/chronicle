import type {
  SpellSearchContext,
  SpellSearchNode,
} from "@/api/typesGenerated";

export type { SpellSearchContext, SpellSearchNode, SpellSearchOp } from "@/api/typesGenerated";
export type SpellSearchScope = "spell" | "effect" | "power";

export interface SpellSearchDraft {
  context: SpellSearchContext;
  where: SpellSearchNode;
}

export const EMPTY_SPELL_SEARCH: SpellSearchDraft = {
  context: { level: null, difficulty: 0 },
  where: { and: [] },
};

export function pruneSpellSearchNode(node: SpellSearchNode | undefined): SpellSearchNode | undefined {
  if (!node) return undefined;
  if (node.and !== undefined || node.or !== undefined) {
    const key = node.or !== undefined ? "or" : "and";
    const children = (node[key] ?? []).map(pruneSpellSearchNode).filter((child): child is SpellSearchNode => child !== undefined);
    return children.length > 0 ? { [key]: children } : undefined;
  }
  if (node.not !== undefined) {
    const child = pruneSpellSearchNode(node.not);
    return child ? { not: child } : undefined;
  }
  if (node.any_effect !== undefined || node.any_power !== undefined) {
    const key = node.any_power !== undefined ? "any_power" : "any_effect";
    const child = pruneSpellSearchNode(node[key]);
    return child ? { [key]: child } : undefined;
  }
  if (!node.field || !node.op || !hasValue(node.value)) return undefined;
  return { field: node.field, op: node.op, value: node.value };
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function prepareSpellSearch(draft: SpellSearchDraft): SpellSearchDraft | undefined {
  const where = pruneSpellSearchNode(draft.where);
  if (!where) return undefined;
  return {
    context: {
      level: draft.context.level == null ? null : Math.max(1, Math.round(draft.context.level)),
      difficulty: Math.max(0, Math.round(draft.context.difficulty)),
    },
    where,
  };
}

/** Encodes a submitted advanced spell search as base64url JSON. */
export function encodeSpellSearch(draft: SpellSearchDraft): string {
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a submitted advanced spell search. Malformed values are ignored. */
export function decodeSpellSearch(encoded: string | null): SpellSearchDraft | undefined {
  if (!encoded) return undefined;
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SpellSearchDraft>;
    if (!parsed || typeof parsed !== "object" || !parsed.context || !parsed.where) return undefined;
    const context = parsed.context as Partial<SpellSearchContext>;
    if ((context.level !== null && typeof context.level !== "number") || typeof context.difficulty !== "number") return undefined;
    return prepareSpellSearch({
      context: { level: context.level ?? null, difficulty: context.difficulty },
      where: parsed.where,
    });
  } catch {
    return undefined;
  }
}
