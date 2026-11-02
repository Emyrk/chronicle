import { describe, expect, it } from "vitest";
import { BASE_UNIT_MODEL_SIZE, publishedModelGeometryScale } from "./modelSizing";

describe("publishedModelGeometryScale", () => {
  it("applies the configured scale after normalizing original models by height", () => {
    expect(publishedModelGeometryScale(true, 52, 1)).toBeCloseTo(BASE_UNIT_MODEL_SIZE / 52);
    expect(publishedModelGeometryScale(true, 52, 1.75)).toBeCloseTo((BASE_UNIT_MODEL_SIZE / 52) * 1.75);
  });

  it("applies the configured scale to grounded tabletop miniatures", () => {
    expect(publishedModelGeometryScale(false, 1, 1.5)).toBeCloseTo(BASE_UNIT_MODEL_SIZE * 1.5);
  });
});
