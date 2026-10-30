interface SearchIdentity {
  id: string;
  realm_id: string;
}

export function matchesLandingSearch(query: string, ...values: Array<string | undefined>): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized.length === 0 || values.some((value) => value?.toLocaleLowerCase().includes(normalized));
}

export function excludeFavoriteResults<TResult extends SearchIdentity, TFavorite extends SearchIdentity>(
  results: readonly TResult[],
  favorites: readonly TFavorite[],
): TResult[] {
  const favoriteKeys = new Set(favorites.map((favorite) => `${favorite.realm_id}:${favorite.id}`));
  return results.filter((result) => !favoriteKeys.has(`${result.realm_id}:${result.id}`));
}
