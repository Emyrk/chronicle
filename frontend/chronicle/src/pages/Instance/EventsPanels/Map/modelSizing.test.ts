import { describe, expect, it } from "vitest";
import { BASE_UNIT_MODEL_SIZE, publishedModelGeometryScale, publishedModelGroupScale } from "./modelSizing";

describe("publishedModelGroupScale", () => {
  it("uses true world scale on calibrated maps and the readable baseline elsewhere", () => {
    expect(publishedModelGroupScale(10.4, 0.75, 2)).toBe(0.75);
    expect(publishedModelGroupScale(10.4, null, 2)).toBeCloseTo(0.5);
  });
});

describe("publishedModelGeometryScale", () => {
  it("applies the configured scale after normalizing original models by height", () => {
    expect(publishedModelGeometryScale(true, 52, 1)).toBeCloseTo(BASE_UNIT_MODEL_SIZE / 52);
    expect(publishedModelGeometryScale(true, 52, 1.75)).toBeCloseTo((BASE_UNIT_MODEL_SIZE / 52) * 1.75);
  });

  it("fits either model kind to a client-derived world height before applying the manual multiplier", () => {
    expect(publishedModelGeometryScale(true, 52, 1, 10.4)).toBeCloseTo(0.2);
    expect(publishedModelGeometryScale(false, 1, 1.5, 4)).toBeCloseTo(6);
  });

  it("applies the configured scale to grounded tabletop miniatures", () => {
    expect(publishedModelGeometryScale(false, 1, 1.5)).toBeCloseTo(BASE_UNIT_MODEL_SIZE * 1.5);
  });
});
