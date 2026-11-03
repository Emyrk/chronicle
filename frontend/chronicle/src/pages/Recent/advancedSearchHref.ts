import { emptyForm, encodeQuery, formToTree } from "@/pages/InstanceSearch/queryModel";

/**
 * Link from Recent to /search, carrying over the filters the search form can
 * show: one picked zone (exact) and the realm. Several zones don't fit the
 * form (and Blocks are an Honored perk), so they're left out; with nothing to
 * carry over it opens an empty search.
 */
export function advancedSearchHref(zones: readonly string[], realmName: string | undefined): string {
  const form = emptyForm();
  if (zones.length === 1) {
    form.zone = zones[0];
    form.zoneMatch = "exact";
  }
  if (realmName) form.realm = realmName;
  const tree = formToTree(form);
  return tree ? `/search?q=${encodeQuery(tree)}` : "/search";
}
