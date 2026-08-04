import { describe, expect, it } from "vitest";
import { LESSONS } from "./capabilities";
import {
  formatLessonCountdown,
  getLessonCountdownProgress,
  LESSON_GUIDES,
  LESSON_STEP_DURATION_MS,
} from "./lessonGuides";

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
    expect(LESSON_GUIDES["dps-vs-total"].map((step) => step.demo?.perSecond)).toEqual([false, true, false]);
    expect(LESSON_GUIDES["spell-ranks"].map((step) => step.demo?.showRanks)).toEqual([false, true, true]);
    expect(LESSON_GUIDES.focus.map((step) => step.demo?.focus)).toEqual([false, true, false]);
  });

  it("automatically demonstrates breakout tabs and details", () => {
    expect(LESSON_GUIDES["abilities-vs-targets"].map((step) => step.demo?.breakout?.tab)).toEqual([
      "ability",
      "ability",
      "target",
    ]);
    expect(LESSON_GUIDES["detailed-results"].map((step) => step.demo?.breakout?.detailMode)).toEqual([
      "summary",
      "outcomes",
      "minmax",
    ]);
  });

  it("formats and clamps the lesson countdown indicator", () => {
    expect(formatLessonCountdown(LESSON_STEP_DURATION_MS)).toBe("4.5s");
    expect(formatLessonCountdown(1_234)).toBe("1.2s");
    expect(formatLessonCountdown(-20)).toBe("0.0s");

    expect(getLessonCountdownProgress(LESSON_STEP_DURATION_MS)).toBe(100);
    expect(getLessonCountdownProgress(LESSON_STEP_DURATION_MS / 2)).toBe(50);
    expect(getLessonCountdownProgress(-1)).toBe(0);
    expect(getLessonCountdownProgress(LESSON_STEP_DURATION_MS * 2)).toBe(100);
  });

  it("does not ask the player to perform panel interactions", () => {
    const manualPhrases = /click|hover|toggle|choose|open .* yourself|press escape/i;
    for (const steps of Object.values(LESSON_GUIDES)) {
      for (const step of steps) {
        expect(step.body).not.toMatch(manualPhrases);
      }
    }
  });
});
