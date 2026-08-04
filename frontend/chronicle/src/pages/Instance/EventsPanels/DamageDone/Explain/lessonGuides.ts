import type { LessonId } from "./capabilities";

export type GuideTarget =
  | "chart"
  | "per-second"
  | "parse-scores"
  | "breakout"
  | "ranks"
  | "focus";

export interface LessonGuideStep {
  title: string;
  body: string;
  target: GuideTarget;
  instruction?: string;
}

export const LESSON_GUIDES: Record<LessonId, LessonGuideStep[]> = {
  "reading-chart": [
    {
      title: "Start with the rows",
      body: "Each row is one player. The value at the right is their damage across the selected encounters.",
      target: "chart",
    },
    {
      title: "Read the class colours",
      body: "The bar colour follows the player's class, so the chart stays scannable even before you read every name.",
      target: "chart",
    },
    {
      title: "Compare contribution",
      body: "Longer bars mean a larger share of the group's damage. Use the values for exact comparisons.",
      target: "chart",
    },
  ],
  "dps-vs-total": [
    {
      title: "Total damage",
      body: "Total damage answers: who contributed the most damage over the selected time window?",
      target: "per-second",
    },
    {
      title: "Switch to DPS",
      body: "Per Second normalizes damage by duration. The tour has switched the real panel to DPS for you.",
      target: "per-second",
      instruction: "Toggle Per Second yourself to compare both views.",
    },
    {
      title: "Choose the useful view",
      body: "Use total damage for overall contribution and DPS when comparing attempts with different durations.",
      target: "chart",
    },
  ],
  "parse-scores": [
    {
      title: "Find the score pill",
      body: "The coloured number beside a player is their parse score for the same boss and specialization.",
      target: "parse-scores",
    },
    {
      title: "Read the scale",
      body: "Scores run from 1 to 99. Higher colours move from green and blue through purple, orange, and pink.",
      target: "parse-scores",
    },
    {
      title: "Use it as context",
      body: "A parse is a comparison, not a diagnosis. Check fight strategy, assignment, gear, and duration before judging it.",
      target: "parse-scores",
    },
  ],
  "breakout-box": [
    {
      title: "Inspect a player",
      body: "Hover a player row to preview their ability and target breakdown without leaving the chart.",
      target: "breakout",
      instruction: "Hover any row in the real panel below.",
    },
    {
      title: "Pin the breakout",
      body: "Click the row to pin the Breakout Box. A pinned box stays open and can be moved while you compare players.",
      target: "breakout",
      instruction: "Click a row to pin it, then drag the breakout by its header.",
    },
    {
      title: "Close when finished",
      body: "Use the close button on a pinned breakout to return to an uncluttered chart.",
      target: "breakout",
    },
  ],
  "abilities-vs-targets": [
    {
      title: "Open a breakout",
      body: "Hover or click a player row. The Breakout Box opens with that player's damage breakdown.",
      target: "breakout",
      instruction: "Open a player row in the panel below.",
    },
    {
      title: "By Ability",
      body: "This view answers which spells, attacks, or effects produced the player's damage.",
      target: "breakout",
    },
    {
      title: "By Target",
      body: "Switch to By Target to see where the damage went and whether priority enemies received enough attention.",
      target: "breakout",
      instruction: "Choose the By Target tab inside the open breakout.",
    },
  ],
  "detailed-results": [
    {
      title: "Open an ability breakdown",
      body: "Start from a player's Breakout Box, then expand an ability to inspect its outcomes.",
      target: "breakout",
      instruction: "Open a player row, then expand an ability.",
    },
    {
      title: "Read hit outcomes",
      body: "Normal hits, critical hits, glancing blows, misses, dodges, and parries explain how the total was produced.",
      target: "breakout",
    },
    {
      title: "Inspect the range",
      body: "Min, average, and max values help separate damage consistency from occasional high rolls.",
      target: "breakout",
    },
  ],
  "spell-ranks": [
    {
      title: "Combined abilities",
      body: "With Ranks off, casts with the same spell name are grouped into one ability total.",
      target: "ranks",
    },
    {
      title: "Separate spell ranks",
      body: "The tour has enabled Ranks on the real panel. Open a breakout to see each spell rank separately.",
      target: "ranks",
      instruction: "Toggle Ranks to compare the grouped and separated views.",
    },
    {
      title: "Spot down-ranking",
      body: "Unexpected lower-rank casts may reveal a mistake—or an intentional mana-saving choice worth discussing.",
      target: "breakout",
    },
  ],
  focus: [
    {
      title: "Choose a player",
      body: "Focus turns the player ranking into an ability chart for one player.",
      target: "focus",
      instruction: "Ctrl+click a row (Cmd+click on Mac), then choose Focus.",
    },
    {
      title: "Read the focused chart",
      body: "The tour has focused the first player using the real panel state. Each row is now one of their abilities.",
      target: "focus",
    },
    {
      title: "Return to the raid",
      body: "Use Back above the ability chart, or press Escape, to restore the full player ranking.",
      target: "focus",
    },
  ],
};
