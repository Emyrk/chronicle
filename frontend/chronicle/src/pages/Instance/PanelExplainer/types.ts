/**
 * Type definitions for the Panel Explainer feature.
 *
 * Each panel can optionally define an explainer. Every explainer provides a
 * summary and tips; panels with full learning content additionally provide a
 * LessonSet — capability-aware lessons, each optionally backed by a Remotion
 * video composition played in-app.
 */

import type { ComponentType, ReactNode } from "react";
import type { Instance } from "../InstancePage";

/**
 * How a lesson renders in the sidebar, derived from the user's live data:
 *
 * - available:        the open log can teach this lesson ("IN YOUR DATA")
 * - limited:          the live data is partial ("LIMITED")
 * - example-required: live data can't demonstrate it ("EXAMPLE DATA")
 */
export type LessonState = "available" | "limited" | "example-required";

/** Sidebar grouping. "more" lessons sit behind the collapsible "More topics". */
export type LessonGroup = "essentials" | "deeper" | "more";

/**
 * A lesson's video: a Remotion composition compiled into the app and played
 * via @remotion/player. `load` MUST be a dynamic import — compositions import
 * `remotion`, and nothing reachable from the instance page may pull remotion
 * into its chunk.
 */
export interface LessonVideo {
  load: () => Promise<{ default: ComponentType }>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

/** One teachable topic for a panel. TCaps is the panel's capability summary. */
export interface Lesson<TCaps> {
  /** Stable id — used for the ?lesson= deep-link param. */
  id: string;
  title: string;
  group: LessonGroup;
  /** Capability-aware one-liner shown under the title. */
  description: (caps: TCaps) => string;
  /** Sidebar state for the current live data. */
  deriveState: (caps: TCaps) => LessonState;
  /** "Try it now" guidance shown with the lesson (and under the video). */
  instruction: string;
  /** When present, shown as a bullet list instead of the instruction —
   * typically recapping the video's points. */
  bullets?: string[];
  /** Absent = text-only lesson (sidebar action reads "Read", not "Watch"). */
  video?: LessonVideo;
  /** Lesson only makes sense on curated example data (e.g. parse scores). */
  exampleOnly?: boolean;
}

/** Full learning content for one panel type. */
export interface LessonSet<TResult, TCaps> {
  /**
   * Pure derivation from the panel's live aggregation result. `instance` is
   * nullable so the derivation stays total while data loads.
   */
  deriveCapabilities: (
    result: TResult | null,
    durationMs: number,
    instance: Instance | null,
  ) => TCaps;
  lessons: Lesson<TCaps>[];
  /** Renders the production panel content on deterministic fixture data. */
  renderExample: () => ReactNode;
}

/**
 * Panel explainer configuration. `lessonSet` absent means the panel renders
 * the simple summary/tips fallback shell.
 */
export interface PanelExplainer<TResult = unknown, TCaps = unknown> {
  /** Short description of what this panel shows. */
  summary: string;
  /** Tips for using this panel effectively. */
  tips: string[];
  /** Full lesson content; only panels with authored lessons define this. */
  lessonSet?: LessonSet<TResult, TCaps>;
}

/** Counts for the sidebar's readiness strip. */
export interface LessonStateCounts {
  available: number;
  limited: number;
  exampleRequired: number;
}

/** Reduce lesson states into the sidebar counts strip. */
export function countLessonStates<TCaps>(
  lessons: Lesson<TCaps>[],
  caps: TCaps,
): LessonStateCounts {
  const counts: LessonStateCounts = { available: 0, limited: 0, exampleRequired: 0 };
  for (const lesson of lessons) {
    const state = lesson.deriveState(caps);
    if (state === "available") counts.available++;
    else if (state === "limited") counts.limited++;
    else counts.exampleRequired++;
  }
  return counts;
}
