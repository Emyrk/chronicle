/**
 * Lesson video: read the line chart — series over time, the sweeping slice
 * tooltip, and the axes.
 * 350 frames @ 30fps, 1280x720 (50-frame intro card + 300 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TimelineDemo } from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES, DEMO_HEALING_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";

const SERIES = [DEMO_DAMAGE_SERIES, DEMO_HEALING_SERIES];

const SWEEP_START = 110; // tooltip sweeps across the fight
const SWEEP_END = 200;
const AXES_FRAME = 210;

export default function ReadLineChartVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Read the line chart"
        bullets={[
          "Each line is one series over the fight",
          "Hover reads every series at once",
          "Time across the bottom, value up the side",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  // The tooltip sweeps from 15s to 100s across the fight.
  const tooltipSec =
    frame >= SWEEP_START && frame < AXES_FRAME
      ? Math.round(interpolate(frame, [SWEEP_START, SWEEP_END], [15, 100], clamp))
      : undefined;

  const linesBoxIn = interpolate(frame, [30, 42, SWEEP_START - 10, SWEEP_START], [0, 1, 1, 0], clamp);
  const axesBoxIn = interpolate(frame, [AXES_FRAME, AXES_FRAME + 12], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 286, 300], [0, 1, 1, 0], clamp);
  const step = frame >= AXES_FRAME ? 3 : frame >= SWEEP_START ? 2 : 1;

  return (
    <>
      <VideoHeader title="Read the line chart" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <TimelineDemo series={SERIES} tooltipSec={tooltipSec} />
      </main>

      {/* The plotted lines… */}
      <div style={{ opacity: linesBoxIn }}>
        <RegionHighlight left={118} top={178} width={560} height={312} color={YELLOW} />
      </div>
      {/* …then the axes. */}
      <div style={{ opacity: axesBoxIn }}>
        <RegionHighlight left={118} top={486} width={560} height={28} color={BLUE} />
        <RegionHighlight left={80} top={178} width={40} height={310} color={BLUE} />
      </div>

      <StepCaption
        step={step}
        text={
          step === 3
            ? (
                <>
                  <span style={{ color: BLUE }}>Time</span> runs across the bottom;{" "}
                  <span style={{ color: BLUE }}>value</span> up the side
                </>
              )
            : step === 2
              ? "Hover anywhere — the tooltip reads every series at that second"
              : (
                  <>
                    Each <span style={{ color: YELLOW }}>line</span> is one series over the fight
                  </>
                )
        }
        opacity={captionOpacity}
      />
    </>
  );
}
