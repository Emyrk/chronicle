/**
 * Lesson video: build your own series.
 *
 * The cursor opens the filter menu and clicks "Edit filters" to flip the
 * panel, presses + to add a series, picks the heal stream and a green color,
 * then clicks "Back" — two lines share the timeline.
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

// Measured targets (stage coordinates).
const FILTER_ICON = { x: 237, y: 152 };
const EDIT_FILTERS_ROW = { x: 324, y: 178 };
const ADD_TAB = { x: 270, y: 218 };
const HEAL_STREAM = { x: 257, y: 297 };
const GREEN_SWATCH = { x: 231, y: 368 };
const BACK_BTN = { x: 653, y: 155 };

const MENU_FRAME = 75; // filter icon clicked → context menu
const FLIP_FRAME = 120; // "Edit filters" clicked → editor
const ADD_FRAME = 175; // + clicked → Series 2 tab
const STREAM_FRAME = 240; // heal stream picked
const COLOR_FRAME = 300; // green picked
const BACK_FRAME = 370; // "Back" clicked → chart with both series

export default function EditSeriesVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Build your own series"
        bullets={[
          "'Edit filters' flips the panel",
          "Press + and pick a stream and color",
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

  const menuOpen = frame >= MENU_FRAME && frame < FLIP_FRAME;
  const inEditor = frame >= FLIP_FRAME && frame < BACK_FRAME;

  const cursorX = interpolate(
    frame,
    [26, 65, 85, 115, 145, ADD_FRAME + 15, STREAM_FRAME - 15, STREAM_FRAME + 15, COLOR_FRAME - 15, COLOR_FRAME + 20, BACK_FRAME - 15, BACK_FRAME + 40],
    [1140, FILTER_ICON.x, FILTER_ICON.x, EDIT_FILTERS_ROW.x, ADD_TAB.x, ADD_TAB.x, HEAL_STREAM.x, HEAL_STREAM.x, GREEN_SWATCH.x, GREEN_SWATCH.x, BACK_BTN.x, 1080],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 65, 85, 115, 145, ADD_FRAME + 15, STREAM_FRAME - 15, STREAM_FRAME + 15, COLOR_FRAME - 15, COLOR_FRAME + 20, BACK_FRAME - 15, BACK_FRAME + 40],
    [600, FILTER_ICON.y, FILTER_ICON.y, EDIT_FILTERS_ROW.y, ADD_TAB.y, ADD_TAB.y, HEAL_STREAM.y, HEAL_STREAM.y, GREEN_SWATCH.y, GREEN_SWATCH.y, BACK_BTN.y, 560],
    { ...clamp, easing: entranceEasing },
  );
  const clicks = [MENU_FRAME, FLIP_FRAME, ADD_FRAME, STREAM_FRAME, COLOR_FRAME, BACK_FRAME].map((f) =>
    interpolate(frame, [f - 4, f, f + 10], [0, 1, 0], clamp),
  );
  const clickPulse = Math.max(...clicks);

  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = frame >= BACK_FRAME ? 3 : frame >= ADD_FRAME ? 2 : 1;

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
              frame >= BACK_FRAME
                ? [DEMO_DAMAGE_SERIES, { ...DEMO_HEALING_SERIES, name: "Series 2" }]
                : [DEMO_DAMAGE_SERIES]
            }
            filterMenu={menuOpen}
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
              ? "Press +, then pick its event stream and a color — filters work per series too"
              : "Open the filter menu and click 'Edit filters' to flip the panel"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
