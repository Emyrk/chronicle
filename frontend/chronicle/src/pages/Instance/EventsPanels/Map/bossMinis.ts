/**
 * Wailing Caverns boss miniatures for the 3D Replay Map, served from
 * `public/boss-minis/<slug>.glb`. A model with a base-colour texture keeps
 * it; an untextured one takes the hostile tint. A boss whose model is missing
 * or fails to load keeps the box marker.
 */
export const BOSS_MINIS_BASE_URL = `${import.meta.env.BASE_URL}boss-minis`;

/** NPC entry -> model file name. */
export const BOSS_MINI_SLUGS: ReadonlyMap<number, string> = new Map([
  [3671, "lady-anacondra"],
  [3670, "lord-pythas"],
  [3669, "lord-cobrahn"],
  [3653, "kresh"],
  [3674, "skum"],
  [3673, "lord-serpentis"],
  [5775, "verdan-the-everliving"],
  [3654, "mutanus-the-devourer"],
  [5912, "deviate-faerie-dragon"],
]);

export function bossMiniSlug(entry: number | undefined): string | undefined {
  return entry === undefined ? undefined : BOSS_MINI_SLUGS.get(entry);
}

export function bossMiniUrl(entry: number | undefined, baseUrl = BOSS_MINIS_BASE_URL): string | undefined {
  const slug = bossMiniSlug(entry);
  return slug ? `${baseUrl.replace(/\/+$/, "")}/${slug}.glb` : undefined;
}
