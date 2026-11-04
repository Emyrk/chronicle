export const BASE_UNIT_MODEL_SIZE = 2.6;
/** Tabletop sculpts stay readable without covering an entire boss arena. */
export const MAX_TABLETOP_MODEL_SPAN_YARDS = 8;

/** Scene/group scale for a model whose geometry was fitted to a world height. */
export function publishedModelGroupScale(
  worldHeight: number,
  worldUnitScale: number | null,
  unitScale: number,
  gameModel = false,
  worldSpan?: number,
): number {
  if (worldUnitScale === null) return unitScale * BASE_UNIT_MODEL_SIZE / Math.max(1e-3, worldHeight);
  if (gameModel || worldSpan === undefined) return worldUnitScale;
  return worldUnitScale * Math.min(1, MAX_TABLETOP_MODEL_SPAN_YARDS / Math.max(1e-3, worldSpan));
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
