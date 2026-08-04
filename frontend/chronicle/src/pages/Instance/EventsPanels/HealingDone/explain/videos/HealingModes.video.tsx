/**
 * Lesson video: effective, overheal, and total views.
 *
 * A scripted cursor flips the panel's view-mode toggle: Effective (default,
 * overheal stacked on each bar) → Overheal (healers re-rank by wasted
 * healing) → Total (effective + overheal combined).
 * 440 frames @ 30fps, 1280x720 (50-frame intro card + 390 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoHealingViewMode } from "@/components/ui/PlayerMetricChart/PlayerMetricChartHealing.demo";
import { PlayerMetricChartHealingDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChartHealing.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";

// Measured centers of the view-mode buttons in the Total row.
const OVERHEAL_BTN = { x: 607, y: 193 };
const TOTAL_BTN = { x: 658, y: 193 };

const OVERHEAL_FRAME = 150; // "Overheal" clicked — chart re-ranks
const TOTAL_FRAME = 290; // "Total" clicked

export default function HealingModesVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Effective, overheal, and total"
        bullets={[
          "Effective healing is the default view",
          "Overheal re-ranks healers by overflow",
          "Total combines both numbers",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const viewMode: DemoHealingViewMode =
    frame >= TOTAL_FRAME ? "total" : frame >= OVERHEAL_FRAME ? "overheal" : "effective";

  const cursorX = interpolate(
    frame,
    [26, 110, 230, 260],
    [1140, OVERHEAL_BTN.x, OVERHEAL_BTN.x, TOTAL_BTN.x],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 110, 230, 260],
    [600, OVERHEAL_BTN.y, OVERHEAL_BTN.y, TOTAL_BTN.y],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [OVERHEAL_FRAME - 4, OVERHEAL_FRAME, OVERHEAL_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [TOTAL_FRAME - 4, TOTAL_FRAME, TOTAL_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2);

  const captionOpacity = interpolate(frame, [8, 18, 376, 390], [0, 1, 1, 0], clamp);
  const step = frame >= TOTAL_FRAME ? 3 : frame >= OVERHEAL_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Effective, overheal, and total" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartHealingDemo viewMode={viewMode} classIconBasePath="/c/icons" />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Total combines effective healing and overheal into one number"
            : step === 2
              ? (
                  <>
                    <span style={{ color: YELLOW }}>Overheal</span> re-ranks healers by wasted
                    healing — HoT classes climb fast
                  </>
                )
              : "Effective healing is the default — overheal stacks on the end of each bar"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
