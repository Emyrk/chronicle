import { describe, expect, it } from "vitest";
import { ONYXIA_GUIDE } from "./onyxiaGuide";
import { guideChapter, guideScene, validateRaidGuide } from "./raidGuideModel";

describe("raid guide model", () => {
  it("keeps the Onyxia prototype structurally valid", () => {
    expect(validateRaidGuide(ONYXIA_GUIDE)).toEqual([]);
    expect(ONYXIA_GUIDE.chapters).toHaveLength(5);
  });

  it("selects a chapter and its right or wrong example", () => {
    const chapter = guideChapter(ONYXIA_GUIDE, "deep-breath");
    expect(chapter?.title).toContain("Move sideways");
    expect(guideScene(chapter!, "correct").callout).toContain("perpendicular");
    expect(guideScene(chapter!, "wrong").callout).toContain("lane");
  });

  it("places a fake raid and tactical drawings in every example", () => {
    for (const chapter of ONYXIA_GUIDE.chapters) {
      for (const example of ["correct", "wrong"] as const) {
        const scene = guideScene(chapter, example);
        expect(scene.units.length).toBeGreaterThan(10);
        expect(scene.units.some((unit) => unit.id === "onyxia")).toBe(true);
        expect(scene.planItems.length).toBeGreaterThan(0);
      }
    }
  });
});
