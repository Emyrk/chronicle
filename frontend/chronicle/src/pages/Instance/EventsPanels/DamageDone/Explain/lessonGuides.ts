import type { AbilityDetailMode, BreakoutTab } from "@/components/ui/AbilityBreakout";
import type { LessonId } from "./capabilities";

export type GuideTarget =
  | "chart"
  | "per-second"
  | "parse-scores"
  | "breakout"
  | "ranks"
  | "focus";

export interface LessonDemoState {
  perSecond?: boolean;
  focus?: boolean;
  showRanks?: boolean;
  breakout?: {
    tab: BreakoutTab;
    detailMode: AbilityDetailMode;
  };
}

export interface LessonGuideStep {
  title: string;
  body: string;
  target: GuideTarget;
  demo?: LessonDemoState;
}

export const LESSON_STEP_DURATION_MS = 4_500;

export function formatLessonCountdown(remainingMs: number): string {
  return `${(Math.max(0, remainingMs) / 1000).toFixed(1)}s`;
}

export function getLessonCountdownProgress(remainingMs: number): number {
  return Math.min(100, Math.max(0, (remainingMs / LESSON_STEP_DURATION_MS) * 100));
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
      body: "Longer bars mean a larger share of the group's damage. The values provide the exact comparison.",
      target: "chart",
    },
  ],
  "dps-vs-total": [
    {
      title: "Total damage",
      body: "The panel starts with total damage, which shows who contributed the most over the selected time window.",
      target: "per-second",
      demo: { perSecond: false },
    },
    {
      title: "Damage per second",
      body: "The tour now switches the real panel to DPS, normalizing every value by encounter duration.",
      target: "per-second",
      demo: { perSecond: true },
    },
    {
      title: "Compare the views",
      body: "Total damage measures overall contribution. DPS is better for comparing attempts with different durations.",
      target: "chart",
      demo: { perSecond: false },
    },
  ],
  "parse-scores": [
    {
      title: "Find the score pill",
      body: "The highlighted coloured numbers compare each player with the same boss and specialization.",
      target: "parse-scores",
    },
    {
      title: "Read the scale",
      body: "Scores run from 1 to 99. Higher colours move from green and blue through purple, orange, and pink.",
      target: "parse-scores",
    },
    {
      title: "Use it as context",
      body: "A parse is a comparison, not a diagnosis. Strategy, assignments, gear, and duration still matter.",
      target: "parse-scores",
    },
  ],
  "breakout-box": [
    {
      title: "Inspect a player",
      body: "The tour automatically opens the first player's real Breakout Box over the chart.",
      target: "breakout",
      demo: { breakout: { tab: "ability", detailMode: "summary" } },
    },
    {
      title: "Keep the breakdown open",
      body: "A pinned breakout stays visible while the underlying player chart remains available for comparison.",
      target: "breakout",
      demo: { breakout: { tab: "ability", detailMode: "summary" } },
    },
    {
      title: "Return to the chart",
      body: "The tour closes the breakout automatically, restoring an unobstructed player ranking.",
      target: "chart",
    },
  ],
  "abilities-vs-targets": [
    {
      title: "Open the breakdown",
      body: "The tour opens a real player breakout and starts with their ability contribution.",
      target: "breakout",
      demo: { breakout: { tab: "ability", detailMode: "summary" } },
    },
    {
      title: "By Ability",
      body: "This view shows which spells, attacks, and effects produced the player's damage.",
      target: "breakout",
      demo: { breakout: { tab: "ability", detailMode: "summary" } },
    },
    {
      title: "By Target",
      body: "The tour switches the same breakout to targets, revealing where the player's damage went.",
      target: "breakout",
      demo: { breakout: { tab: "target", detailMode: "summary" } },
    },
  ],
  "detailed-results": [
    {
      title: "Start with the summary",
      body: "The compact ability table shows total damage, contribution, cast count, hits, and critical rate.",
      target: "breakout",
      demo: { breakout: { tab: "ability", detailMode: "summary" } },
    },
    {
      title: "Reveal hit outcomes",
      body: "The tour expands the table to show normal hits, critical hits, misses, dodges, and other outcomes.",
      target: "breakout",
      demo: { breakout: { tab: "ability", detailMode: "outcomes" } },
    },
    {
      title: "Inspect the range",
      body: "The tour switches to minimum, average, and maximum values for each available hit type.",
      target: "breakout",
      demo: { breakout: { tab: "ability", detailMode: "minmax" } },
    },
  ],
  "spell-ranks": [
    {
      title: "Combined abilities",
      body: "Ranks begin disabled, so casts with the same spell name are grouped into one ability total.",
      target: "ranks",
      demo: {
        showRanks: false,
        breakout: { tab: "ability", detailMode: "summary" },
      },
    },
    {
      title: "Separate spell ranks",
      body: "The tour enables Ranks and rebuilds the same breakout with each spell rank on its own row.",
      target: "ranks",
      demo: {
        showRanks: true,
        breakout: { tab: "ability", detailMode: "summary" },
      },
    },
    {
      title: "Spot down-ranking",
      body: "Lower-rank rows can reveal a mistake or an intentional mana-saving choice worth discussing.",
      target: "breakout",
      demo: {
        showRanks: true,
        breakout: { tab: "ability", detailMode: "summary" },
      },
    },
  ],
  focus: [
    {
      title: "Start with the raid",
      body: "Focus begins from the complete player ranking so the change in perspective is clear.",
      target: "focus",
      demo: { focus: false },
    },
    {
      title: "Focus one player",
      body: "The tour automatically replaces the ranking with the first player's per-ability chart.",
      target: "focus",
      demo: { focus: true },
    },
    {
      title: "Return to the raid",
      body: "The tour exits Focus and restores the full player ranking automatically.",
      target: "focus",
      demo: { focus: false },
    },
  ],
};
