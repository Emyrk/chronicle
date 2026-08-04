/**
 * Lesson video: total healing versus HPS — a scripted cursor flips the
 * Per Second toggle and the value column is boxed before and after.
 * 320 frames @ 30fps, 1280x720 (50-frame intro card + 270 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartHealingDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChartHealing.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";

const TOGGLE_FRAME = 120;

export default function TotalVsHpsVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Total healing versus HPS"
        bullets={[
          "HPS is healing divided by encounter duration",
          "Flip 'Per second' — same order, new numbers",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const perSecond = frame >= TOGGLE_FRAME;

  // Tip lands on the toggle switch itself (same header layout as damage).
  const cursorX = interpolate(frame, [25, 100], [1080, 655], { ...clamp, easing: entranceEasing });
  const cursorY = interpolate(frame, [25, 100], [560, 150], { ...clamp, easing: entranceEasing });
  const clickPulse = interpolate(frame, [108, 116, 128], [0, 1, 0], clamp);
  const toggleHighlight = interpolate(frame, [96, 108, 150, 165], [0, 1, 1, 0], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 250, 264], [0, 1, 1, 0], clamp);
  const beforeBoxOpacity = interpolate(frame, [30, 40, 112, 120], [0, 1, 1, 0], clamp);
  const afterIn = interpolate(frame, [130, 144], [0, 1], clamp);

  return (
    <>
      <VideoHeader title="Total healing versus HPS" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartHealingDemo classIconBasePath="/c/icons" perSecond={perSecond} />
      </main>

      {/* Value column: totals (yellow) before the flip, /s values (blue) after. */}
      <div style={{ opacity: beforeBoxOpacity }}>
        <RegionHighlight left={502} top={208} width={78} height={164} color={YELLOW} />
      </div>
      <div style={{ opacity: afterIn }}>
        <RegionHighlight left={495} top={208} width={88} height={164} color={BLUE} />
      </div>

      {/* Ring around the header's Per second toggle while the cursor works it. */}
      <div
        className="absolute rounded-lg"
        style={{
          left: 565,
          top: 138,
          width: 122,
          height: 30,
          boxShadow: `0 0 0 ${toggleHighlight * 2}px ${YELLOW}`,
          zIndex: 205,
        }}
      />
      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={perSecond ? 2 : 1}
        text={
          perSecond ? (
            <>
              Same order, <span style={{ color: BLUE }}>new numbers</span> — every value divided
              by the encounter duration
            </>
          ) : (
            "HPS is total healing divided by the total duration of the encounters"
          )
        }
        opacity={captionOpacity}
      />
    </>
  );
}
