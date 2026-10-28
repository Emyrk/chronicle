import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapCompass } from "./MapCompass";
import { compassRotationDegrees, unwrapCompassRadians } from "./mapCompassModel";

describe("MapCompass", () => {
  it.each([
    [0, 0],
    [Math.PI / 2, 90],
    [-Math.PI / 2, -90],
    [Math.PI, 180],
  ])("converts a camera yaw of %s radians to %s degrees", (radians, degrees) => {
    expect(compassRotationDegrees(radians)).toBeCloseTo(degrees);
  });

  it("crosses south along the short arc in either direction", () => {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;

    expect(compassRotationDegrees(unwrapCompassRadians(radians(179), radians(-179)))).toBeCloseTo(181);
    expect(compassRotationDegrees(unwrapCompassRadians(radians(-179), radians(179)))).toBeCloseTo(-181);
  });

  it("preserves completed rotations when the wrapped angle returns to zero", () => {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    expect(compassRotationDegrees(unwrapCompassRadians(radians(359), radians(1)))).toBeCloseTo(361);
  });

  it("explains the north and south needle colors", () => {
    const markup = renderToStaticMarkup(<MapCompass />);
    expect(markup).toContain("Red points north and white points south");
    expect(markup).toContain(">N<");
    expect(markup).toContain(">S<");
  });
});
