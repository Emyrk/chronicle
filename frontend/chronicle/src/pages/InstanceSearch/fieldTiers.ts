import type { InstanceSearchField } from "@/api/typesGenerated";
import type { Node } from "./queryModel";

/*
 * Who can search by a field. Anonymous users get the server's anonymous
 * fields; logged-in users get everything else except the costly fields below,
 * which are for Honored supporters. The Honored lock is UI-only (the server
 * accepts these from anyone logged in), like the Code editor's.
 */

/** The costly fields: player parses and stats, and boss / trash / idle time. */
export const HONORED_FIELDS: ReadonlySet<string> = new Set([
  "player.parse",
  "player.dps",
  "player.hps",
  "player.avg_ilvl",
  "instance.boss_time_ms",
  "instance.trash_time_ms",
  "instance.idle_time_ms",
]);

export type FieldLock = "honored" | "login";

/** Why the viewer can't use a field, or null when they can. Unknown access (undefined) counts as allowed. */
export function fieldLock(field: InstanceSearchField, access: { honored?: boolean; loggedIn?: boolean }): FieldLock | null {
  if (access.loggedIn === false && !field.anonymous) return "login";
  if (access.honored === false && HONORED_FIELDS.has(field.name)) return "honored";
  return null;
}

/** Every field a tree filters on. */
export function treeFields(n: Node | undefined): string[] {
  if (!n) return [];
  if (n.field) return [n.field];
  const kids = [...(n.and ?? []), ...(n.or ?? []), n.not, n.any_player, n.any_encounter, n.count_players?.where, n.count_encounters?.where];
  return kids.flatMap((k) => treeFields(k));
}

/** True when the tree uses a field only Honored supporters can search by. */
export function treeNeedsHonored(n: Node | undefined): boolean {
  return treeFields(n).some((f) => HONORED_FIELDS.has(f));
}
