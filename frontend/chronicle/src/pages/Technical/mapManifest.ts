import {
  isSupportedMapManifestFormat,
  mapManifestUrl,
  WOW_MAP_MANIFEST_FORMAT,
  type WowMapInstance,
  type WowMapManifest,
  type WowMapMeshInstance,
} from "./mapGallery";

/**
 * The dataset's map manifest, fetched from the icon CDN. In development
 * `VITE_MAP_MANIFEST_OVERLAY` names a URL (served from `public/`, see
 * `.env.development`) of a mesh layer in the publisher's
 * `manifest.meshes.json` shape, merged over the fetched manifest client-side so
 * a dungeon mesh can be tried on the live page before anything is on the CDN.
 * Production builds never read it.
 */
export async function fetchMapManifest(
  iconBaseUrl: string,
  overlayUrl: string | undefined = import.meta.env.DEV ? import.meta.env.VITE_MAP_MANIFEST_OVERLAY as string | undefined : undefined,
): Promise<WowMapManifest> {
  const response = await fetch(mapManifestUrl(iconBaseUrl));
  if (!response.ok) throw new Error(`Map manifest request failed with ${response.status}`);
  const manifest = await response.json() as WowMapManifest;
  if (!isSupportedMapManifestFormat(manifest.format)) {
    throw new Error(`Unsupported map manifest format: ${manifest.format || "missing"}`);
  }
  if (!overlayUrl) return manifest;
  const overlayResponse = await fetch(overlayUrl);
  if (!overlayResponse.ok) throw new Error(`Map manifest overlay ${overlayUrl} failed with ${overlayResponse.status}`);
  return applyMapManifestMeshLayer(manifest, await overlayResponse.json() as WowMapMeshLayer);
}

/** A meshes layer as `merge-wowdata-maps --meshes` reads it. */
export interface WowMapMeshLayer {
  format: string;
  target: { product: string; build?: string; region?: string; locale?: string };
  instances: WowMapMeshLayerInstance[];
}

export interface WowMapMeshLayerInstance {
  mapID: number;
  /** Required when the manifest has no instance for `mapID`: the mesh-only instance's name. */
  name?: string;
  mesh?: WowMapMeshInstance;
}

/**
 * Merges a meshes layer over a manifest with the publisher's rules
 * (scripts/dbcdata/cli/mergewowdatamaps.go): v2 format, a product-only target
 * matching the manifest, one entry per mapID carrying only `mesh`. An entry
 * for an existing instance attaches the mesh; one for an unknown mapID
 * creates a mesh-only instance (`floors: []`) named by the entry. Throws on
 * any violation, so a bad overlay is loud rather than silently ignored.
 */
export function applyMapManifestMeshLayer(manifest: WowMapManifest, layer: WowMapMeshLayer): WowMapManifest {
  if (layer.format !== WOW_MAP_MANIFEST_FORMAT) throw new Error(`Map manifest overlay: unsupported format ${JSON.stringify(layer.format)}`);
  if (layer.target?.product !== manifest.target.product || layer.target.build || layer.target.region || layer.target.locale) {
    throw new Error("Map manifest overlay: target does not match the manifest (product only)");
  }
  const instances = [...(manifest.instances ?? [])];
  const seen = new Set<number>();
  for (const entry of layer.instances ?? []) {
    if (seen.has(entry.mapID)) throw new Error(`Map manifest overlay: duplicate mapID ${entry.mapID}`);
    seen.add(entry.mapID);
    const extra = Object.keys(entry).filter((key) => !["mapID", "name", "mesh"].includes(key));
    if (!entry.mesh || extra.length > 0) throw new Error(`Map manifest overlay: mapID ${entry.mapID} must contain mesh only`);
    const index = instances.findIndex((instance) => instance.mapID === entry.mapID);
    if (index >= 0) {
      instances[index] = { ...instances[index], mesh: entry.mesh };
      continue;
    }
    if (!entry.name) throw new Error(`Map manifest overlay: mapID ${entry.mapID} has no instance in the manifest and no name`);
    const created: WowMapInstance = { mapID: entry.mapID, name: entry.name, instanceType: 0, directory: "", floors: [], mesh: entry.mesh };
    instances.push(created);
  }
  return { ...manifest, instances };
}
