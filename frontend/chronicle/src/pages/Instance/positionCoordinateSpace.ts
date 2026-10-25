export type PositionCoordinateSpace = "world" | "ui-map-normalized";

/** Legacy API responses omitted this field, so derive the parser's known default. */
export function defaultPositionCoordinateSpace(format: string | undefined): PositionCoordinateSpace {
  return format === "2.4.3-cc-addon" || format === "3.3.5a-cc-addon"
    ? "ui-map-normalized"
    : "world";
}
