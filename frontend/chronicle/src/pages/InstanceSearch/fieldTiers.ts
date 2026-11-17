import type { InstanceSearchField } from "@/api/typesGenerated";
import type { Node } from "./queryModel";

/*
 * Who can search by a field. Anonymous users get the server's anonymous
 * fields; logged-in users get everything else except the costly fields below,
 * which require Honored or Revered. The server also enforces Revered access
 * for encounter difficulty and variant filters.
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

export const REVERED_FIELDS: ReadonlySet<string> = new Set([
  "encounter.hostile_count",
  "encounter.difficulty",
  "encounter.variant",
]);

export type FieldLock = "honored" | "revered" | "login";

/** Why the viewer can't use a field, or null when they can. Unknown access allows legacy fields; Revered fields fail closed. */
export function fieldLock(field: InstanceSearchField, access: { honored?: boolean; revered?: boolean; loggedIn?: boolean }): FieldLock | null {
  if (access.loggedIn === false && !field.anonymous) return "login";
  if (REVERED_FIELDS.has(field.name) && access.revered !== true) return "revered";
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

/** Field gate including imported, shared, code, and recent queries. */
export function treeNeedsRevered(n: Node | undefined): boolean {
  return treeFields(n).some((f) => REVERED_FIELDS.has(f)) || hasEncounterPlayers(n);
}

/** Player participation and metrics bound to a single stored boss kill. */
function hasEncounterPlayers(n: Node | undefined, encounter = false): boolean {
  if (!n) return false;
  if (encounter && (n.any_player || n.count_players)) return true;
  return [...(n.and ?? []), ...(n.or ?? []), n.not].some((k) => hasEncounterPlayers(k, encounter))
    || hasEncounterPlayers(n.any_encounter, true)
    || hasEncounterPlayers(n.count_encounters?.where, true);
}
