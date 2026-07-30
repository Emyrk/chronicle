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
