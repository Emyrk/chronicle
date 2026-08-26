export function findProfileToHydrate<T extends { id: string }>(
  profileId: string | null,
  lastHydratedProfileId: string | null,
  options: readonly T[],
): T | undefined {
  if (!profileId || profileId === lastHydratedProfileId) return undefined;
  return options.find((option) => option.id === profileId);
}
