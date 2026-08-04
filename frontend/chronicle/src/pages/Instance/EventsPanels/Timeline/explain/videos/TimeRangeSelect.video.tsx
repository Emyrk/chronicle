/**
 * Lesson video: select a time window.
 *
 * The cursor drags across the chart (the selection rectangle follows),
 * releases — the saved highlight and the Reset Selection pill appear —
 * then clicks Reset Selection to restore the whole fight.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TimelineDemo } from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

// Stage x for a fight-second (plot spans x122..672 for 0..120s).
const secToX = (sec: number) => 122 + (sec / 120) * 550;
const DRAG_Y = 330; // cursor height while dragging

const START_SEC = 28;
const END_SEC = 84;

const DRAG_START = 100; // mouse down
const DRAG_END = 210; // mouse up → range saved
const RESET_FRAME = 330; // Reset Selection clicked
const RESET_PILL = { x: 173, y: 187 };

export default function TimeRangeSelectVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Select a time window"
        bullets={[
          "Drag across the chart to select",
          "Every panel narrows to that window",
          "Reset Selection restores the fight",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  // Drag progress: the current edge of the selection follows the cursor.
  const dragSec = interpolate(frame, [DRAG_START, DRAG_END], [START_SEC, END_SEC], {
    ...clamp,
    easing: entranceEasing,
  });
  const dragging = frame >= DRAG_START && frame < DRAG_END;
  const saved = frame >= DRAG_END && frame < RESET_FRAME;

  const cursorX = interpolate(
    frame,
    [26, 90, DRAG_START, DRAG_END, DRAG_END + 40, RESET_FRAME - 20],
    [1140, secToX(START_SEC), secToX(START_SEC), secToX(END_SEC), secToX(END_SEC), RESET_PILL.x],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 90, DRAG_START, DRAG_END, DRAG_END + 40, RESET_FRAME - 20],
    [620, DRAG_Y, DRAG_Y, DRAG_Y, DRAG_Y, RESET_PILL.y],
    { ...clamp, easing: entranceEasing },
  );
  const clickDown = interpolate(frame, [DRAG_START - 4, DRAG_START, DRAG_START + 10], [0, 1, 0], clamp);
  const clickUp = interpolate(frame, [DRAG_END - 4, DRAG_END, DRAG_END + 10], [0, 1, 0], clamp);
  const clickReset = interpolate(frame, [RESET_FRAME - 4, RESET_FRAME, RESET_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(clickDown, clickUp, clickReset);

  const captionOpacity = interpolate(frame, [8, 18, 406, 420], [0, 1, 1, 0], clamp);
  const step = frame >= RESET_FRAME ? 3 : frame >= DRAG_END ? 2 : 1;

  return (
    <>
      <VideoHeader title="Select a time window" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <TimelineDemo
          series={[DEMO_DAMAGE_SERIES]}
          dragRect={dragging ? { startSec: START_SEC, endSec: dragSec } : undefined}
          timeRange={saved ? { startSec: START_SEC, endSec: END_SEC } : undefined}
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "'Reset Selection' (or double-click) brings back the whole fight"
            : step === 2
              ? "Release — every panel on the page now shows only this window"
              : "Click and drag across the chart to select a window of the fight"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
