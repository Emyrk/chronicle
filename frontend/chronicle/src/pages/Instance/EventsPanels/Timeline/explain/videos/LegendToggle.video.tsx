/**
 * Lesson video: toggle series from the legend. The cursor hides Healing
 * (struck-through label, line gone), then brings it back.
 * 380 frames @ 30fps, 1280x720 (50-frame intro card + 330 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TimelineDemo } from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES, DEMO_HEALING_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const SERIES = [DEMO_DAMAGE_SERIES, DEMO_HEALING_SERIES];

// Measured legend position (top-right of the chart body).
const HEALING_LEGEND = { x: 650, y: 210 };

const HIDE_FRAME = 130; // Healing hidden
const SHOW_FRAME = 250; // Healing back

export default function LegendToggleVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Toggle series from the legend"
        bullets={[
          "Click a legend entry to hide its line",
          "Hidden series strike through",
          "Click again to bring it back",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const hidden = frame >= HIDE_FRAME && frame < SHOW_FRAME;

  const cursorX = interpolate(frame, [26, 100], [1140, HEALING_LEGEND.x], {
    ...clamp,
    easing: entranceEasing,
  });
  const cursorY = interpolate(frame, [26, 100], [600, HEALING_LEGEND.y], {
    ...clamp,
    easing: entranceEasing,
  });
  const click1 = interpolate(frame, [HIDE_FRAME - 4, HIDE_FRAME, HIDE_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [SHOW_FRAME - 4, SHOW_FRAME, SHOW_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2);

  const captionOpacity = interpolate(frame, [8, 18, 316, 330], [0, 1, 1, 0], clamp);
  const step = frame >= SHOW_FRAME ? 3 : frame >= HIDE_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Toggle series from the legend" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <TimelineDemo series={SERIES} hiddenSeries={hidden ? ["healing"] : []} />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Click again — the line comes right back"
            : step === 2
              ? "Hidden: the label strikes through and the line disappears"
              : "Click a series in the legend to hide it"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
