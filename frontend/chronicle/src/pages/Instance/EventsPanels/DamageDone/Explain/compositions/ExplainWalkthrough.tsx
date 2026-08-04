/**
 * Remotion composition that renders the REAL DamageDoneContent with
 * fixture data, overlaying animated cursor, highlights, and step labels
 * to walk through a lesson.
 *
 * This composition runs inside @remotion/player which renders in the
 * same React tree — so parent contexts (QueryClient, etc.) are available.
 */

import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { DamageDoneContent } from "../../DamageDoneContent";
import {
  getFixtureRenderProps,
  getFixtureParsePillsMap,
  getFixtureSpellDataMap,
  FIXTURE_DURATION_MS,
} from "../fixture";
import { Cursor, StepLabel } from "./primitives";
import { clamp } from "./hooks";
import type { LessonStep } from "./lessonTimings";

export interface ExplainWalkthroughProps {
  steps: LessonStep[];
}

export function ExplainWalkthrough({ steps }: ExplainWalkthroughProps) {
  const frame = useCurrentFrame();

  // Fixture data — rendered by the real DamageDoneContent
  const renderProps = getFixtureRenderProps();
  const parsePills = getFixtureParsePillsMap();
  const spellData = getFixtureSpellDataMap();

  // Find the current step
  const currentStepIndex = steps.reduce(
    (idx, s, i) => (frame >= s.startFrame ? i : idx),
    0,
  );
  const currentStep = steps[currentStepIndex];
  const nextStep = steps[currentStepIndex + 1];

  // Cursor animation: move to the step's target
  const cursorVisible = !!currentStep.cursorTarget;
  let cursorX = 0;
  let cursorY = 0;
  if (currentStep.cursorTarget) {
    const ease = Easing.bezier(0.16, 1, 0.3, 1);
    const moveStart = currentStep.startFrame + 10;
    const moveEnd = currentStep.clickFrame ?? currentStep.startFrame + 40;
    cursorX = interpolate(frame, [moveStart, moveEnd], [currentStep.cursorTarget[0] + 15, currentStep.cursorTarget[0]], {
      ...clamp, easing: ease,
    });
    cursorY = interpolate(frame, [moveStart, moveEnd], [currentStep.cursorTarget[1] + 10, currentStep.cursorTarget[1]], {
      ...clamp, easing: ease,
    });
  }

  // Click pulse
  let clickPulse = 0;
  if (currentStep.clickFrame) {
    clickPulse = interpolate(
      frame,
      [currentStep.clickFrame, currentStep.clickFrame + 6, currentStep.clickFrame + 14],
      [0, 1, 0],
      clamp,
    );
  }

  // Highlight ring
  const highlight = currentStep.highlight;
  const highlightOpacity = highlight
    ? interpolate(frame, [currentStep.startFrame, currentStep.startFrame + 15], [0, 1], clamp)
    : 0;

  // Step label entrance
  const labelEntrance = interpolate(
    frame,
    [currentStep.startFrame, currentStep.startFrame + 12],
    [0, 1],
    clamp,
  );
  // Label exit (fade into next step)
  const labelExit = nextStep
    ? interpolate(frame, [nextStep.startFrame - 8, nextStep.startFrame], [1, 0], clamp)
    : 1;
  const labelOpacity = labelEntrance * labelExit;

  return (
    <AbsoluteFill style={{ position: "relative", overflow: "hidden" }} className="dark bg-background text-foreground">
      {/* Real DamageDoneContent with fixture data */}
      <div style={{ position: "absolute", inset: 0, padding: "8px 12px" }}>
        <DamageDoneContent
          {...renderProps}
          durationMs={FIXTURE_DURATION_MS}
          sourceType="players"
          parsePillsOverride={parsePills}
          spellDataOverride={spellData}
        />
      </div>

      {/* Highlight ring overlay */}
      {highlight && highlightOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            left: `${highlight[0]}%`,
            top: `${highlight[1]}%`,
            width: `${highlight[2]}%`,
            height: `${highlight[3]}%`,
            border: "2px solid hsl(var(--primary))",
            borderRadius: 8,
            opacity: highlightOpacity * 0.8,
            pointerEvents: "none",
            boxShadow: "0 0 12px hsl(var(--primary) / 0.3)",
          }}
        />
      )}

      {/* Animated cursor */}
      {cursorVisible && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <Cursor
            x={cursorX * 6.4}  // Convert % to px (640px composition width)
            y={cursorY * 4}     // Convert % to px (400px composition height)
            clicking={clickPulse}
          />
        </div>
      )}

      {/* Step label */}
      <StepLabel step={currentStep.step} text={currentStep.text} opacity={labelOpacity} />
    </AbsoluteFill>
  );
}
