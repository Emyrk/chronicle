export const BASE_UNIT_MODEL_SIZE = 2.6;

/** Scene/group scale for a model whose geometry was fitted to a world height. */
export function publishedModelGroupScale(worldHeight: number, worldUnitScale: number | null, unitScale: number): number {
  return worldUnitScale ?? unitScale * BASE_UNIT_MODEL_SIZE / Math.max(1e-3, worldHeight);
}

/** Baseline geometry scale for a published replay model before the map's unit scale. */
export function publishedModelGeometryScale(
  gameModel: boolean,
  nativeHeight: number,
  mapScale: number,
  worldHeight?: number,
): number {
  const height = Math.max(1e-3, nativeHeight);
  if (worldHeight !== undefined) return (worldHeight / height) * mapScale;
  const baseline = gameModel ? BASE_UNIT_MODEL_SIZE / height : BASE_UNIT_MODEL_SIZE;
  return baseline * mapScale;
}
