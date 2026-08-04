/**
 * Lesson composition registry.
 *
 * Maps each LessonId to a Remotion component + duration config.
 * Compositions without a dedicated video use the ComingSoon placeholder.
 */

import type { ComponentType } from "react";
import type { LessonId } from "../capabilities";
import { ReadingChartVideo } from "./ReadingChart";
import { DpsVsTotalVideo } from "./DpsVsTotal";
import { BreakoutBoxVideo } from "./BreakoutBox";
import { ComingSoonVideo } from "./ComingSoon";

export interface LessonCompositionConfig {
  component: ComponentType<{ title?: string }>;
  durationInFrames: number;
  fps: number;
  /** If true, the component needs a `title` prop. */
  needsTitle?: boolean;
}

function comingSoon(): LessonCompositionConfig {
  return { component: ComingSoonVideo, durationInFrames: 60, fps: 30, needsTitle: true };
}

/** Registry of lesson compositions. */
export const LESSON_COMPOSITIONS: Record<LessonId, LessonCompositionConfig> = {
  "reading-chart": { component: ReadingChartVideo, durationInFrames: 180, fps: 30 },
  "dps-vs-total": { component: DpsVsTotalVideo, durationInFrames: 180, fps: 30 },
  "parse-scores": comingSoon(),
  "breakout-box": { component: BreakoutBoxVideo, durationInFrames: 180, fps: 30 },
  "abilities-vs-targets": comingSoon(),
  "detailed-results": comingSoon(),
  "spell-ranks": comingSoon(),
  "focus": comingSoon(),
};
