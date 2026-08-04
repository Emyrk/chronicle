/**
 * Per-lesson animation timings and cursor choreography.
 *
 * Each lesson defines steps with timing, cursor targets (as CSS-relative
 * coordinates within the panel), and instruction text.
 */

import type { LessonId } from "../capabilities";

export interface LessonStep {
  /** Frame this step starts at. */
  startFrame: number;
  /** Instruction text shown during this step. */
  text: string;
  /** Step number displayed in the badge. */
  step: number;
  /** Cursor target as [x%, y%] relative to the composition. */
  cursorTarget?: [number, number];
  /** Frame the cursor "clicks" (shows pulse). */
  clickFrame?: number;
  /** Optional highlight ring position [x%, y%, width%, height%]. */
  highlight?: [number, number, number, number];
}

export interface LessonTiming {
  durationInFrames: number;
  fps: number;
  steps: LessonStep[];
}

export const LESSON_TIMINGS: Record<LessonId, LessonTiming> = {
  "reading-chart": {
    durationInFrames: 180,
    fps: 30,
    steps: [
      { startFrame: 0, step: 1, text: "Each horizontal bar is one player — longer bars mean more damage" },
      { startFrame: 60, step: 2, text: "Bars are colour-coded by class (Mage = blue, Warrior = brown, …)" },
      { startFrame: 120, step: 3, text: "Compare bar lengths to see who contributed the most" },
    ],
  },
  "dps-vs-total": {
    durationInFrames: 210,
    fps: 30,
    steps: [
      { startFrame: 0, step: 1, text: "Values show total damage dealt across selected encounters" },
      {
        startFrame: 60, step: 2, text: "Toggle 'Per Second' to switch to DPS view",
        cursorTarget: [92, 4], clickFrame: 90,
        highlight: [82, 0, 18, 8],
      },
      { startFrame: 120, step: 3, text: "Now values show damage per second — useful for comparing fights of different lengths" },
    ],
  },
  "parse-scores": {
    durationInFrames: 150,
    fps: 30,
    steps: [
      { startFrame: 0, step: 1, text: "The coloured number pills beside each player are parse scores" },
      { startFrame: 50, step: 2, text: "Scores range 1–99: green → blue → purple → orange → pink (legendary)" },
      { startFrame: 100, step: 3, text: "Parse scores compare performance against the community for the same boss and spec" },
    ],
  },
  "breakout-box": {
    durationInFrames: 210,
    fps: 30,
    steps: [
      {
        startFrame: 0, step: 1, text: "Click any player row to open their Breakout Box",
        cursorTarget: [40, 30], clickFrame: 45,
      },
      { startFrame: 70, step: 2, text: "The Breakout Box shows a breakdown of damage by ability" },
      { startFrame: 140, step: 3, text: "Pin the breakout by clicking — it stays open and is draggable" },
    ],
  },
  "abilities-vs-targets": {
    durationInFrames: 180,
    fps: 30,
    steps: [
      { startFrame: 0, step: 1, text: "Inside the Breakout Box, 'By Ability' shows each spell's contribution" },
      { startFrame: 60, step: 2, text: "Switch to 'By Target' to see damage split across enemies" },
      { startFrame: 120, step: 3, text: "Use this to see if damage was focused on the right target" },
    ],
  },
  "detailed-results": {
    durationInFrames: 180,
    fps: 30,
    steps: [
      { startFrame: 0, step: 1, text: "In the Breakout Box, click 'More detail' to expand an ability" },
      { startFrame: 60, step: 2, text: "See hit types: normal hits, crits, glancing blows, misses" },
      { startFrame: 120, step: 3, text: "Click ↕ to reveal min / avg / max damage per hit type" },
    ],
  },
  "spell-ranks": {
    durationInFrames: 180,
    fps: 30,
    steps: [
      {
        startFrame: 0, step: 1, text: "Toggle the Ranks button in the panel header",
        highlight: [82, 8, 15, 6],
      },
      { startFrame: 60, step: 2, text: "Abilities are now separated by spell rank (e.g. Frostbolt Rank 4 vs Rank 11)" },
      { startFrame: 120, step: 3, text: "Spot accidental down-ranked casts that cost DPS" },
    ],
  },
  "focus": {
    durationInFrames: 210,
    fps: 30,
    steps: [
      {
        startFrame: 0, step: 1, text: "Ctrl+click (Cmd on Mac) a player row to open the context menu",
        cursorTarget: [40, 25], clickFrame: 40,
      },
      { startFrame: 70, step: 2, text: "Choose 'Focus' to drill into that player's per-ability chart" },
      { startFrame: 140, step: 3, text: "Click 'Back' or press Escape to return to the full player list" },
    ],
  },
};
