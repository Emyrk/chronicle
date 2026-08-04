import { describe, expect, it } from "vitest";
import { LESSONS } from "./capabilities";
import { LESSON_GUIDES } from "./lessonGuides";

describe("LESSON_GUIDES", () => {
  it("provides a concise guided sequence for every lesson", () => {
    for (const lesson of LESSONS) {
      const steps = LESSON_GUIDES[lesson.id];
      expect(steps, `${lesson.id} should have guide steps`).toBeDefined();
      expect(steps.length, `${lesson.id} should have three steps`).toBe(3);

      for (const step of steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
        expect(step.target.length).toBeGreaterThan(0);
      }
    }
  });

  it("drives real panel controls for stateful lessons", () => {
    expect(LESSON_GUIDES["dps-vs-total"][1].target).toBe("per-second");
    expect(LESSON_GUIDES["spell-ranks"][1].target).toBe("ranks");
    expect(LESSON_GUIDES.focus[1].target).toBe("focus");
  });

  it("gives hands-on instructions for interactive panel features", () => {
    expect(LESSON_GUIDES["breakout-box"].some((step) => step.instruction)).toBe(true);
    expect(LESSON_GUIDES["abilities-vs-targets"].some((step) => step.instruction)).toBe(true);
    expect(LESSON_GUIDES["detailed-results"].some((step) => step.instruction)).toBe(true);
  });
});
