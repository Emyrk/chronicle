import { describe, expect, it } from "vitest";
import {
  BASE_UNIT_MODEL_SIZE,
  MAX_TABLETOP_MODEL_SPAN_YARDS,
  publishedModelGeometryScale,
  publishedModelGroupScale,
} from "./modelSizing";

describe("publishedModelGroupScale", () => {
  it("uses true world scale on calibrated maps and the readable baseline elsewhere", () => {
    expect(publishedModelGroupScale(10.4, 0.75, 2)).toBe(0.75);
    expect(publishedModelGroupScale(10.4, null, 2)).toBeCloseTo(0.5);
  });

  it("caps oversized tabletop sculpts without changing original game models", () => {
    const onyxiaSpan = 12.22;
    expect(publishedModelGroupScale(81.4688, 0.75, 2, false, onyxiaSpan))
      .toBeCloseTo(0.75 * MAX_TABLETOP_MODEL_SPAN_YARDS / onyxiaSpan);
    expect(publishedModelGroupScale(81.4688, 0.75, 2, true, onyxiaSpan)).toBe(0.75);
  });

  it("leaves ordinary tabletop sculpts and uncalibrated artwork unchanged", () => {
    expect(publishedModelGroupScale(6.733, 0.75, 2, false, 7.36)).toBe(0.75);
    expect(publishedModelGroupScale(81.4688, null, 2, false, 12.22)).toBeCloseTo(2 * BASE_UNIT_MODEL_SIZE / 81.4688);
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
