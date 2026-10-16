import {
  isSupportedMapManifestFormat,
  mapManifestUrl,
  type WowMapManifest,
} from "./mapGallery";

/** The dataset's map manifest, fetched from its tenant-configured icon CDN. */
export async function fetchMapManifest(iconBaseUrl: string): Promise<WowMapManifest> {
  const response = await fetch(mapManifestUrl(iconBaseUrl));
  if (!response.ok) throw new Error(`Map manifest request failed with ${response.status}`);
  const manifest = await response.json() as WowMapManifest;
  if (!isSupportedMapManifestFormat(manifest.format)) {
    throw new Error(`Unsupported map manifest format: ${manifest.format || "missing"}`);
  }
  return manifest;
}
