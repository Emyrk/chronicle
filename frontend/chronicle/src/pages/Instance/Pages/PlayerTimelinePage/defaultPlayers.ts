/**
 * Default A/B players when nothing was picked or shared. Favorites come first,
 * then the top damage dealer and the next player of the same class.
 *
 * @param ranked players in this encounter by total damage, highest first.
 */
export function defaultPlayers(
  ranked: readonly (readonly [string, number])[],
  classOf: (guid: string) => string | undefined,
  isFavorite: (guid: string) => boolean,
): [string | null, string | null] {
  const ids = ranked.map(([guid]) => guid);
  const favorites = ids.filter(isFavorite);
  const a = favorites[0] ?? ids[0] ?? null;
  if (!a) return [null, null];
  const cls = classOf(a);
  const others = (list: string[]) => list.filter((g) => g !== a);
  const sameClass = (list: string[]) => list.find((g) => classOf(g) === cls) ?? null;
  const b =
    sameClass(others(favorites)) ?? others(favorites)[0] ?? sameClass(others(ids)) ?? null;
  return [a, b];
}
