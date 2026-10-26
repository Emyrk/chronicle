import type { SupportedInstance } from "@/api/typesGenerated";
import type { WowMapManifest } from "@/pages/Technical/mapGallery";

export type DungeonShelfKind = "3d" | "2d" | "coming";

export interface DungeonShelfCard {
  name: string;
  kind: DungeonShelfKind;
}

const KIND_ORDER: Record<DungeonShelfKind, number> = { "3d": 0, "2d": 1, coming: 2 };

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The tenant's supported instances, each marked by its maps manifest entry:
 * a mesh is a 3D floor, any other entry a 2D map, no entry still coming.
 * 3D floors first, then 2D, then coming; names alphabetical within each.
 */
export function dungeonShelfCards(
  instances: readonly SupportedInstance[],
  manifest: WowMapManifest | undefined,
): DungeonShelfCard[] {
  const entries = new Map((manifest?.instances ?? []).map((entry) => [normalizedName(entry.name), entry]));
  return instances
    .map((instance): DungeonShelfCard => {
      // Manifest names can carry the zone ("Excavation Site: Wetlands"), so try the zone names too.
      const entry = [instance.name, ...(instance.zone_names ?? [])]
        .map((name) => entries.get(normalizedName(name)))
        .find(Boolean);
      return { name: instance.name, kind: entry?.mesh ? "3d" : entry ? "2d" : "coming" };
    })
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
}
