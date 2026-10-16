import { describe, expect, it } from "vitest";
import { parseLayoutLab, serializeLayoutLab } from "./parseLayout";

describe("layout strip persistence", () => {
  it("round trips immutable strip kind and orientation on layout items", () => {
    const raw = serializeLayoutLab([
      {
        id: "strip-1",
        title: "Raid Durability",
        kind: "strip",
        stripType: "raid_durability",
        orientation: "horizontal",
        x: 0,
        y: 0,
        w: 12,
        h: 1,
        minW: 6,
        minH: 1,
        maxH: 2,
      },
    ], {});

    expect(parseLayoutLab(raw).items[0]).toMatchObject({
      kind: "strip",
      stripType: "raid_durability",
      orientation: "horizontal",
      w: 12,
      h: 1,
    });
  });
});

describe("layout appearance", () => {
  const items = [{ id: "panel-1", title: "Map", x: 0, y: 0, w: 12, h: 7 }];

  it("round-trips the seamless and fit flags", () => {
    const serialized = serializeLayoutLab(items, { "panel-1": "map" }, undefined, undefined, { seamless: true, fit: true });
    expect(JSON.parse(serialized)).toMatchObject({ seamless: true, fit: true });
    expect(parseLayoutLab(serialized)).toMatchObject({ seamless: true, fit: true });
  });

  it("leaves it out of layouts that are not seamless", () => {
    const serialized = serializeLayoutLab(items, { "panel-1": "map" });
    expect("seamless" in JSON.parse(serialized)).toBe(false);
    expect(parseLayoutLab(serialized).seamless).toBeUndefined();
    expect(parseLayoutLab(JSON.stringify({ ...JSON.parse(serialized), seamless: "yes" })).seamless).toBeUndefined();
  });
});
