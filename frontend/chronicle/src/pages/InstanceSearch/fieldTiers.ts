import type { InstanceSearchField } from "@/api/typesGenerated";
import type { Node } from "./queryModel";

/*
 * Who can search by a field. Anonymous users get the server's anonymous
 * fields; logged-in users get everything else except the costly fields
 * (player parses and stats, boss / trash / idle time), which are for Honored
 * supporters. GET /search/fields reports each field's minimum_tier and the
 * server answers 403 below it. The Code editor's lock is UI-only.
 */

/** The fields only Honored supporters can search by, from GET /search/fields. */
export function honoredFields(fields: readonly InstanceSearchField[] | undefined): ReadonlySet<string> {
  return new Set((fields ?? []).filter((f) => f.minimum_tier === "honored").map((f) => f.name));
}

export type FieldLock = "honored" | "login";

/** Why the viewer can't use a field, or null when they can. Unknown access (undefined) counts as allowed. */
export function fieldLock(field: InstanceSearchField, access: { honored?: boolean; loggedIn?: boolean }): FieldLock | null {
  if (access.loggedIn === false && !field.anonymous) return "login";
  if (access.honored === false && field.minimum_tier === "honored") return "honored";
  return null;
}

/** Every field a tree filters on. */
export function treeFields(n: Node | undefined): string[] {
  if (!n) return [];
  if (n.field) return [n.field];
  const kids = [...(n.and ?? []), ...(n.or ?? []), n.not, n.any_player, n.any_encounter, n.count_players?.where, n.count_encounters?.where];
  return kids.flatMap((k) => treeFields(k));
}

/** True when the tree uses one of the honored fields (see honoredFields). */
export function treeNeedsHonored(n: Node | undefined, honored: ReadonlySet<string>): boolean {
  return treeFields(n).some((f) => honored.has(f));
}
