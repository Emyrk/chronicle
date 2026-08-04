/**
 * Lesson video: build your own series.
 *
 * Starts on the chart with one Damage series, flips to the back-side editor,
 * presses + to add a series, picks the heal stream and a green color, then
 * flips back — two lines share the timeline.
 * 530 frames @ 30fps, 1280x720 (50-frame intro card + 480 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  TimelineDemo,
  TimelineEditorDemo,
} from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES, DEMO_HEALING_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

// Measured targets inside the editor (stage coordinates).
const ADD_TAB = { x: 270, y: 218 };
const HEAL_STREAM = { x: 257, y: 297 };
const GREEN_SWATCH = { x: 231, y: 368 };

const FLIP_FRAME = 90; // card flips to the editor
const ADD_FRAME = 140; // + clicked → Series 2 tab
const STREAM_FRAME = 220; // heal stream picked
const COLOR_FRAME = 300; // green picked
const FLIP_BACK_FRAME = 380; // back to the chart with both series

export default function EditSeriesVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Build your own series"
        bullets={[
          "Flip the card and press + to add",
          "Pick a stream, aggregation, and color",
          "Both series share the timeline",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const inEditor = frame >= FLIP_FRAME && frame < FLIP_BACK_FRAME;

  const cursorX = interpolate(
    frame,
    [26, 120, ADD_FRAME + 15, STREAM_FRAME - 15, STREAM_FRAME + 15, COLOR_FRAME - 15, COLOR_FRAME + 20, FLIP_BACK_FRAME + 30],
    [1140, ADD_TAB.x, ADD_TAB.x, HEAL_STREAM.x, HEAL_STREAM.x, GREEN_SWATCH.x, GREEN_SWATCH.x, 1080],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 120, ADD_FRAME + 15, STREAM_FRAME - 15, STREAM_FRAME + 15, COLOR_FRAME - 15, COLOR_FRAME + 20, FLIP_BACK_FRAME + 30],
    [600, ADD_TAB.y, ADD_TAB.y, HEAL_STREAM.y, HEAL_STREAM.y, GREEN_SWATCH.y, GREEN_SWATCH.y, 560],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [ADD_FRAME - 4, ADD_FRAME, ADD_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [STREAM_FRAME - 4, STREAM_FRAME, STREAM_FRAME + 10], [0, 1, 0], clamp);
  const click3 = interpolate(frame, [COLOR_FRAME - 4, COLOR_FRAME, COLOR_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2, click3);

  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = frame >= FLIP_BACK_FRAME ? 3 : frame >= ADD_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Build your own series" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        {inEditor ? (
          <TimelineEditorDemo
            activeTab={frame >= ADD_FRAME ? 1 : 0}
            hasNewSeries={frame >= ADD_FRAME}
            newStream={frame >= STREAM_FRAME ? "heal" : undefined}
            newColor={frame >= COLOR_FRAME ? "#22c55e" : undefined}
          />
        ) : (
          <TimelineDemo
            series={
              frame >= FLIP_BACK_FRAME
                ? [DEMO_DAMAGE_SERIES, { ...DEMO_HEALING_SERIES, name: "Series 2" }]
                : [DEMO_DAMAGE_SERIES]
            }
          />
        )}
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Back on the front — both series share the timeline"
            : step === 2
              ? "Pick its event stream and a color — filters work per series too"
              : "Flip the card and press + to add a series"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
