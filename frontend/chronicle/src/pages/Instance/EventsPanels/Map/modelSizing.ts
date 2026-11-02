export const BASE_UNIT_MODEL_SIZE = 2.6;

/** Baseline geometry scale for a published replay model before the map's unit scale. */
export function publishedModelGeometryScale(gameModel: boolean, nativeHeight: number, mapScale: number): number {
  const baseline = gameModel ? BASE_UNIT_MODEL_SIZE / Math.max(1e-3, nativeHeight) : BASE_UNIT_MODEL_SIZE;
  return baseline * mapScale;
}
